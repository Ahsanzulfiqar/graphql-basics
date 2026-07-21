import mongoose from "mongoose";
import { UserInputError } from "apollo-server-express";

import ACCOUNT from "../models/Account.js";
import VOUCHER from  "../models/Voucher.js";
import VOUCHER_LINE from "../models/VoucherLine.js";
import COUNTER from "../models/Counter.js";

const round2 = (n) =>
  Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

/**
 * Auto voucher number
 * Example: JV-000001
 */



export const getNextNo = async (key, prefix, session) => {
  console.log("GET NEXT NO KEY:", key, "PREFIX:", prefix);

  if (!key) {
    throw new Error("Counter key is missing");
  }

  const counter = await COUNTER.findOneAndUpdate(
    { key },
    {
      $inc: { seq: 1 },
      $setOnInsert: { key },
    },
    {
      new: true,
      upsert: true,
      session,
    }
  );

  return `${prefix}-${String(counter.seq).padStart(6, "0")}`;
};
/**
 * Find required account by name
 */
async function getAccountByName(name, session) {
  const account = await ACCOUNT.findOne({
    name,
    isDeleted: { $ne: true },
    isActive: { $ne: false },
  }).session(session);

  if (!account) {
    throw new UserInputError(`Required account not found: ${name}`);
  }

  return account;
}

/**
 * Create voucher with lines
 */
async function createAccountingVoucher(
  {
    date = new Date(),
    memo,
    createdBy,
    sourceType = "MANUAL",
    sourceId,
    paymentMode = null,
    lines,
  },
  session
) {
  if (!createdBy) throw new UserInputError("createdBy is required for voucher");

  if (!Array.isArray(lines) || lines.length < 2) {
    throw new UserInputError("Voucher must have at least 2 lines");
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const [index, line] of lines.entries()) {
    if (!line.accountId || !mongoose.Types.ObjectId.isValid(line.accountId)) {
      throw new UserInputError(`Invalid accountId at line ${index + 1}`);
    }

    const debit = round2(line.debit || 0);
    const credit = round2(line.credit || 0);

    if (debit < 0 || credit < 0) {
      throw new UserInputError(`Debit/Credit cannot be negative at line ${index + 1}`);
    }

    const hasDebit = debit > 0;
    const hasCredit = credit > 0;

    if (hasDebit === hasCredit) {
      throw new UserInputError(
        `Line ${index + 1}: enter either debit or credit only`
      );
    }

    totalDebit += debit;
    totalCredit += credit;
  }

  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);

  if (totalDebit !== totalCredit) {
    throw new UserInputError(
      `Voucher not balanced. Debit (${totalDebit}) must equal Credit (${totalCredit}).`
    );
  }

  const voucherNo = await getNextNo("voucher", "JV", session);

  const [voucher] = await VOUCHER.create(
    [
      {
        voucherNo,
        type: "JOURNAL",
        date,
        memo,
        status: "POSTED",
        createdBy,
        sourceType,
        sourceId,
        paymentMode,
      },
    ],
    { session }
  );

  const lineDocs = lines.map((line) => ({
    voucherId: voucher._id,
    accountId: line.accountId,
    debit: round2(line.debit || 0),
    credit: round2(line.credit || 0),
    memo: line.memo || "",
    sourceType,
    sourceId,
    paymentMode,
  }));

  await VOUCHER_LINE.insertMany(lineDocs, { session });

  return voucher;
}

/**
 * SALE REVENUE POSTING
 *
 * Trigger point:
 * MarkDelivered
 *
 * Entry:
 * Dr Accounts Receivable
 * Cr Sales Revenue
 */
export async function postSaleRevenueVoucher(sale, user, session) {
  if (!sale?._id) {
    throw new UserInputError("Sale is required");
  }

  if (!user?.id) {
    throw new UserInputError("User context is required");
  }

  if (sale.accounting?.salesPosted) {
    throw new UserInputError("Sale revenue already posted to accounts");
  }

  const existing = await VOUCHER.findOne({
    sourceType: "SALE",
    sourceId: sale._id,
    status: { $ne: "VOID" },
  }).session(session);

  if (existing) {
    throw new UserInputError("Sale revenue voucher already exists");
  }

  const amount = round2(sale.totalAmount || 0);

  if (amount <= 0) {
    throw new UserInputError("Sale totalAmount must be greater than 0");
  }

  const receivableAccount = await getAccountByName(
    "Accounts Receivable",
    session
  );

  const salesRevenueAccount = await getAccountByName(
    "Sales Revenue",
    session
  );

  return createAccountingVoucher(
    {
      date: sale.statusTimestamps?.deliveredAt || new Date(),
      memo: `Sale revenue posted - ${sale.invoiceNo || sale._id}`,
      createdBy: user.id,
      sourceType: "SALE",
      sourceId: sale._id,
      paymentMode: null,
      lines: [
        {
          accountId: receivableAccount._id,
          debit: amount,
          credit: 0,
          memo: "Receivable from delivered sale",
        },
        {
          accountId: salesRevenueAccount._id,
          debit: 0,
          credit: amount,
          memo: "Sales revenue",
        },
      ],
    },
    session
  );
}

/**
 * SALE PAYMENT POSTING
 *
 * Trigger point:
 * MarkSalePaid
 *
 * COD:
 * Dr Cash
 * Cr Accounts Receivable
 *
 * ONLINE:
 * Dr Bank
 * Cr Accounts Receivable
 */
export async function postSalePaymentVoucher(sale, mode, ctx, session) {
  if (!sale?._id) throw new UserInputError("Sale is required");
  if (!ctx?.user?.id) throw new UserInputError("User context is required");

  const paymentMode = String(mode || "").toUpperCase();

  if (!["COD", "ONLINE"].includes(paymentMode)) {
    throw new UserInputError("payment mode must be COD or ONLINE");
  }

  if (sale.accounting?.paymentPosted) {
    throw new UserInputError("Sale payment already posted to accounts");
  }

  const existing = await VOUCHER.findOne({
    sourceType: "SALE_PAYMENT",
    sourceId: sale._id,
    status: { $ne: "VOID" },
  }).session(session);

  if (existing) {
    throw new UserInputError("Sale payment voucher already exists");
  }

  const amount = round2(sale.totalAmount || 0);
  if (amount <= 0) throw new UserInputError("Payment amount must be greater than 0");

  const debitAccountName = paymentMode === "COD" ? "Cash" : "Bank";

  const debitAccount = await getAccountByName(debitAccountName, session);
  const receivableAccount = await getAccountByName("Accounts Receivable", session);

  return createAccountingVoucher(
    {
      date: new Date(),
      memo: `Sale payment received (${paymentMode}) - ${sale.invoiceNo || sale._id}`,
      createdBy: ctx.user.id,
      sourceType: "SALE_PAYMENT",
      sourceId: sale._id,
      paymentMode,
      lines: [
        {
          accountId: debitAccount._id,
          debit: amount,
          credit: 0,
          memo: `${paymentMode} payment received`,
        },
        {
          accountId: receivableAccount._id,
          debit: 0,
          credit: amount,
          memo: "Receivable cleared",
        },
      ],
    },
    session
  );
}

export async function postPurchaseVoucher(purchase, user, session) {
  const createdBy = user?._id || user?.id;

  if (!createdBy) {
    throw new Error("User context is required");
  }

  const inventoryAccount = await ACCOUNT.findOne({
    code: "1040",
    isDeleted: { $ne: true },
  }).session(session);

  const payableAccount = await ACCOUNT.findOne({
    code: "2010",
    isDeleted: { $ne: true },
  }).session(session);

  if (!inventoryAccount) {
    throw new Error("Inventory account not found");
  }

  if (!payableAccount) {
    throw new Error("Accounts Payable account not found");
  }

  const totalAmount = Number(purchase.totalAmount || 0);

  if (totalAmount <= 0) {
    throw new Error("Purchase amount must be greater than 0");
  }

  const voucherNo = await getNextNo("voucher", "JV", session);

  const [voucher] = await VOUCHER.create(
    [
      {
        voucherNo,
        type: "JOURNAL",
        date: purchase.purchaseDate || new Date(),
        memo: `Purchase received: ${
          purchase.purchaseNo || purchase.invoiceNo || purchase._id
        }`,
        status: "POSTED",
        createdBy,
        sourceType: "PURCHASE",
        sourceId: purchase._id,
      },
    ],
    { session }
  );

  await VOUCHER_LINE.insertMany(
    [
      {
        voucherId: voucher._id,
        accountId: inventoryAccount._id,
        debit: totalAmount,
        credit: 0,
        memo: "Inventory purchased",
        sourceType: "PURCHASE",
        sourceId: purchase._id,
      },
      {
        voucherId: voucher._id,
        accountId: payableAccount._id,
        debit: 0,
        credit: totalAmount,
        memo: "Supplier payable",
        sourceType: "PURCHASE",
        sourceId: purchase._id,
      },
    ],
    { session }
  );

  return voucher;
}

export async function postSaleCOGSVoucher(sale, user, session) {
  if (!sale?._id) {
    throw new UserInputError("Sale is required");
  }

  const createdBy = user?._id || user?.id;

  if (!createdBy) {
    throw new UserInputError("User context is required");
  }

  if (sale.accounting?.cogsPosted) {
    throw new UserInputError("Sale COGS already posted to accounts");
  }

  const existing = await VOUCHER.findOne({
    sourceType: "SALE_COGS",
    sourceId: sale._id,
    status: { $ne: "VOID" },
  }).session(session);

  if (existing) {
    throw new UserInputError("Sale COGS voucher already exists");
  }

  const totalCost = round2(
    Number(sale.totalCost || 0) ||
      (sale.items || []).reduce((sum, item) => {
        return sum + Number(item.lineCost || 0);
      }, 0)
  );

  if (totalCost <= 0) {
    throw new UserInputError("Sale totalCost must be greater than 0 for COGS posting");
  }

  const cogsAccount = await getAccountByName("Cost of Goods Sold", session);
  const inventoryAccount = await getAccountByName("Inventory", session);

  return createAccountingVoucher(
    {
      date: sale.statusTimestamps?.deliveredAt || new Date(),
      memo: `Sale COGS posted - ${sale.invoiceNo || sale._id}`,
      createdBy,
      sourceType: "SALE_COGS",
      sourceId: sale._id,
      paymentMode: null,
      lines: [
        {
          accountId: cogsAccount._id,
          debit: totalCost,
          credit: 0,
          memo: "Cost of goods sold",
        },
        {
          accountId: inventoryAccount._id,
          debit: 0,
          credit: totalCost,
          memo: "Inventory reduced against delivered sale",
        },
      ],
    },
    session
  );
}
