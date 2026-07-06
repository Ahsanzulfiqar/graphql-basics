import mongoose from "mongoose";
import {
  ApolloError,
  UserInputError,
} from "apollo-server-express";

import ACCOUNT from "../../models/Account.js";
import VOUCHER_LINE from "../../models/VoucherLine.js";
import VOUCHER from "../../models/Voucher.js";
import { getNextNo } from "../../services/accounting.helpers.js";

import {
  requireRoles,
  requireAuth,
} from "../../auth/permissions/permissions.js";

const accountResolvers = {
  Query: {
    GetAccounts: async (_, { search, type, isActive }, ctx) => {
      requireAuth(ctx);

      try {
        const q = { isDeleted: { $ne: true } };

        if (search) {
          const regex = { $regex: search, $options: "i" };
          q.$or = [{ name: regex }, { code: regex }];
        }
        if (type) q.type = type;
        if (typeof isActive === "boolean") {
          q.isActive = isActive;
        }
        return await ACCOUNT.find(q).sort({ code: 1, name: 1 });
      } catch (err) {
        console.error("GetAccounts Error:", err);
        throw new ApolloError(err.message || "Failed to fetch accounts");
      }
    },

    GetAccountById: async (_, { id }, ctx) => {
      requireAuth(ctx);

      try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new UserInputError("Invalid account id");
        }

        const account = await ACCOUNT.findOne({
          _id: id,
          isDeleted: { $ne: true },
        });

        if (!account) throw new UserInputError("Account not found");

        return account;
      } catch (err) {
        console.error("GetAccountById Error:", err);

        if (err instanceof UserInputError) throw err;

        throw new ApolloError(err.message || "Failed to fetch account");
      }
    },

    GetAccountTree: async (_, __, ctx) => {
      requireAuth(ctx);

      try {
        const accounts = await ACCOUNT.find({
          isDeleted: { $ne: true },
        })
          .sort({ code: 1, name: 1 })
          .lean();

        const map = new Map();

        accounts.forEach((acc) => {
          map.set(String(acc._id), {
            ...acc,
            children: [],
          });
        });

        const tree = [];

        accounts.forEach((acc) => {
          const node = map.get(String(acc._id));

          if (acc.parentId && map.has(String(acc.parentId))) {
            map.get(String(acc.parentId)).children.push(node);
          } else {
            tree.push(node);
          }
        });

        return tree;
      } catch (err) {
        console.error("GetAccountTree Error:", err);
        throw new ApolloError(err.message || "Failed to fetch account tree");
      }
    },

    GetVouchers: async (_, { from, to, status }, ctx) => {
  requireAuth(ctx);

  try {
    const q = {};

    if (status) q.status = status;

    if (from || to) {
      q.date = {};
      if (from) q.date.$gte = new Date(from);

      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        q.date.$lte = end;
      }
    }

    const vouchers = await VOUCHER.find(q)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    return vouchers || [];
  } catch (err) {
    console.error("GetVouchers Error:", err);
    throw new ApolloError(err.message || "Failed to fetch vouchers");
  }
},

GetVoucherById: async (_, { id }, ctx) => {
  requireAuth(ctx);

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new UserInputError("Invalid voucher id");
    }

    const voucher = await VOUCHER.findById(id).lean();

    if (!voucher) {
      throw new UserInputError("Voucher not found");
    }

    const lines = await VOUCHER_LINE.find({
      voucherId: id,
    }).lean();

    return {
      voucher,
      lines: lines || [],
    };
  } catch (err) {
    console.error("GetVoucherById Error:", err);

    if (err instanceof UserInputError) throw err;

    throw new ApolloError(err.message || "Failed to fetch voucher");
  }
},

GetTrialBalance: async (_, { from, to }, ctx) => {
  requireAuth(ctx);

  try {
    const match = {
      "voucher.status": "POSTED",
    };

    if (from || to) {
      match["voucher.date"] = {};
      if (from) match["voucher.date"].$gte = new Date(from);

      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        match["voucher.date"].$lte = end;
      }
    }

    const rows = await VOUCHER_LINE.aggregate([
      {
        $lookup: {
          from: "vouchers",
          localField: "voucherId",
          foreignField: "_id",
          as: "voucher",
        },
      },
      { $unwind: "$voucher" },
      { $match: match },
      {
        $group: {
          _id: "$accountId",
          debitTotal: { $sum: "$debit" },
          creditTotal: { $sum: "$credit" },
        },
      },
      {
        $lookup: {
          from: "accounts",
          localField: "_id",
          foreignField: "_id",
          as: "account",
        },
      },
      { $unwind: "$account" },
      {
        $project: {
          accountId: "$_id",
          accountName: "$account.name",
          accountCode: "$account.code",
          accountType: "$account.type",
          debitTotal: 1,
          creditTotal: 1,
          balance: { $subtract: ["$debitTotal", "$creditTotal"] },
        },
      },
      { $sort: { accountCode: 1 } },
    ]);

    let totalDebit = 0;
    let totalCredit = 0;

    const cleanRows = (rows || []).map((r) => {
      const debitTotal = Number((r.debitTotal || 0).toFixed(2));
      const creditTotal = Number((r.creditTotal || 0).toFixed(2));

      totalDebit += debitTotal;
      totalCredit += creditTotal;

      return {
        accountId: String(r.accountId),
        accountName: r.accountName,
        accountCode: r.accountCode || null,
        accountType: r.accountType,
        debitTotal,
        creditTotal,
        balance: Number(((r.balance || 0)).toFixed(2)),
      };
    });

    totalDebit = Number(totalDebit.toFixed(2));
    totalCredit = Number(totalCredit.toFixed(2));

    return {
      from: from || null,
      to: to || null,
      rows: cleanRows,
      totalDebit,
      totalCredit,
      isBalanced: totalDebit === totalCredit,
    };
  } catch (err) {
    console.error("GetTrialBalance Error:", err);
    throw new ApolloError(err.message || "Failed to fetch trial balance");
  }
},

  },

  Mutation: {
    SeedDefaultAccounts: async (_, __, ctx) => {
      requireRoles(ctx, ["ADMIN"]);

      try {
        const createIfMissing = async (data) => {
          let account = await ACCOUNT.findOne({
            name: data.name,
            isDeleted: { $ne: true },
          });

          if (!account) {
            account = await ACCOUNT.create({
              ...data,
              isActive: true,
            });
          }

          return account;
        };

        // Parent Accounts
        const assets = await createIfMissing({
          code: "1000",
          name: "Assets",
          type: "ASSET",
        });

        const liabilities = await createIfMissing({
          code: "2000",
          name: "Liabilities",
          type: "LIABILITY",
        });

        const equity = await createIfMissing({
          code: "3000",
          name: "Equity",
          type: "EQUITY",
        });

        const income = await createIfMissing({
          code: "4000",
          name: "Income",
          type: "INCOME",
        });

        const expenses = await createIfMissing({
          code: "5000",
          name: "Expenses",
          type: "EXPENSE",
        });

        // Assets Children
        await createIfMissing({
          code: "1010",
          name: "Cash",
          type: "ASSET",
          parentId: assets._id,
        });

        await createIfMissing({
          code: "1020",
          name: "Bank",
          type: "ASSET",
          parentId: assets._id,
        });

        await createIfMissing({
          code: "1030",
          name: "Accounts Receivable",
          type: "ASSET",
          parentId: assets._id,
        });

        await createIfMissing({
          code: "1040",
          name: "Inventory",
          type: "ASSET",
          parentId: assets._id,
        });

        // Liabilities Children
        await createIfMissing({
          code: "2010",
          name: "Accounts Payable",
          type: "LIABILITY",
          parentId: liabilities._id,
        });

        // Equity Children
        await createIfMissing({
          code: "3010",
          name: "Owner Capital",
          type: "EQUITY",
          parentId: equity._id,
        });

        // Income Children
        await createIfMissing({
          code: "4010",
          name: "Sales Revenue",
          type: "INCOME",
          parentId: income._id,
        });

        // Expense Children
        await createIfMissing({
          code: "5010",
          name: "General Expense",
          type: "EXPENSE",
          parentId: expenses._id,
        });

        await createIfMissing({
          code: "5020",
          name: "Rent Expense",
          type: "EXPENSE",
          parentId: expenses._id,
        });

        await createIfMissing({
          code: "5030",
          name: "Salary Expense",
          type: "EXPENSE",
          parentId: expenses._id,
        });

        await createIfMissing({
          code: "5040",
          name: "Marketing Expense",
          type: "EXPENSE",
          parentId: expenses._id,
        });

        await createIfMissing({
          code: "5050",
          name: "Courier Expense",
          type: "EXPENSE",
          parentId: expenses._id,
        });

        return await ACCOUNT.find({
          isDeleted: { $ne: true },
        }).sort({ code: 1 });
      } catch (err) {
        console.error("SeedDefaultAccounts Error:", err);

        if (err?.code === 11000) {
          throw new UserInputError("Duplicate account code or name");
        }

        throw new ApolloError(
          err.message || "Failed to seed default accounts"
        );
      }
    },

    CreateAccount: async (_, { data }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);

      try {
        const name = data?.name?.trim();
        const code = data?.code?.trim();

        if (!name) throw new UserInputError("Account name is required");
        if (!data?.type) throw new UserInputError("Account type is required");

        if (
          !["ASSET", "LIABILITY", "INCOME", "EXPENSE", "EQUITY"].includes(
            data.type
          )
        ) {
          throw new UserInputError("Invalid account type");
        }

        if (data.parentId) {
          if (!mongoose.Types.ObjectId.isValid(data.parentId)) {
            throw new UserInputError("Invalid parentId");
          }

          const parent = await ACCOUNT.findOne({
            _id: data.parentId,
            isDeleted: { $ne: true },
          });

          if (!parent) throw new UserInputError("Parent account not found");

          if (parent.type !== data.type) {
            throw new UserInputError(
              "Parent account type must match child account type"
            );
          }
        }

        const exists = await ACCOUNT.findOne({
          name,
          isDeleted: { $ne: true },
        });

        if (exists) {
          throw new UserInputError("Account with this name already exists");
        }

        if (code) {
          const codeExists = await ACCOUNT.findOne({
            code,
            isDeleted: { $ne: true },
          });

          if (codeExists) {
            throw new UserInputError("Account with this code already exists");
          }
        }

        return await ACCOUNT.create({
          name,
          code,
          type: data.type,
          parentId: data.parentId || null,
          isActive: data.isActive ?? true,
        });
      } catch (err) {
        console.error("CreateAccount Error:", err);

        if (err instanceof UserInputError) throw err;

        if (err?.code === 11000) {
          throw new UserInputError("Duplicate account name or code");
        }

        throw new ApolloError(err.message || "Failed to create account");
      }
    },

    UpdateAccount: async (_, { id, data }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);

      try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new UserInputError("Invalid account id");
        }

        const account = await ACCOUNT.findOne({
          _id: id,
          isDeleted: { $ne: true },
        });

        if (!account) throw new UserInputError("Account not found");

        if (data.name !== undefined) {
          const name = data.name.trim();
          if (!name) throw new UserInputError("Account name cannot be empty");

          const nameExists = await ACCOUNT.findOne({
            _id: { $ne: id },
            name,
            isDeleted: { $ne: true },
          });

          if (nameExists) {
            throw new UserInputError(
              "Another account with this name already exists"
            );
          }

          account.name = name;
        }

        if (data.code !== undefined) {
          const code = data.code?.trim();

          if (code) {
            const codeExists = await ACCOUNT.findOne({
              _id: { $ne: id },
              code,
              isDeleted: { $ne: true },
            });

            if (codeExists) {
              throw new UserInputError(
                "Another account with this code already exists"
              );
            }
          }

          account.code = code || undefined;
        }

        if (data.type !== undefined) {
          if (
            !["ASSET", "LIABILITY", "INCOME", "EXPENSE", "EQUITY"].includes(
              data.type
            )
          ) {
            throw new UserInputError("Invalid account type");
          }

          account.type = data.type;
        }

        if (data.parentId !== undefined) {
          if (data.parentId) {
            if (!mongoose.Types.ObjectId.isValid(data.parentId)) {
              throw new UserInputError("Invalid parentId");
            }

            if (String(data.parentId) === String(id)) {
              throw new UserInputError("Account cannot be parent of itself");
            }

            const parent = await ACCOUNT.findOne({
              _id: data.parentId,
              isDeleted: { $ne: true },
            });

            if (!parent) throw new UserInputError("Parent account not found");

            if (parent.type !== account.type) {
              throw new UserInputError(
                "Parent account type must match account type"
              );
            }

            account.parentId = data.parentId;
          } else {
            account.parentId = null;
          }
        }

        if (data.isActive !== undefined) {
          account.isActive = data.isActive;
        }

        await account.save();
        return account;
      } catch (err) {
        console.error("UpdateAccount Error:", err);

        if (err instanceof UserInputError) throw err;

        if (err?.code === 11000) {
          throw new UserInputError("Duplicate account name or code");
        }

        throw new ApolloError(err.message || "Failed to update account");
      }
    },

    DeleteAccount: async (_, { id }, ctx) => {
      requireRoles(ctx, ["ADMIN"]);

      try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new UserInputError("Invalid account id");
        }

        const account = await ACCOUNT.findOne({
          _id: id,
          isDeleted: { $ne: true },
        });

        if (!account) throw new UserInputError("Account not found");

        const hasChildren = await ACCOUNT.exists({
          parentId: id,
          isDeleted: { $ne: true },
        });

        if (hasChildren) {
          throw new UserInputError(
            "Account has child accounts. Delete/disable child accounts first."
          );
        }

        const usedInVoucher = await VOUCHER_LINE.exists({
          accountId: id,
        });

        if (usedInVoucher) {
          throw new UserInputError(
            "Account is used in vouchers. Disable it instead of deleting."
          );
        }

        account.isDeleted = true;
        account.isActive = false;
        await account.save();

        return true;
      } catch (err) {
        console.error("DeleteAccount Error:", err);

        if (err instanceof UserInputError) throw err;

        throw new ApolloError(err.message || "Failed to delete account");
      }
    },

    DisableAccount: async (_, { id }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);

      try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new UserInputError("Invalid account id");
        }

        const account = await ACCOUNT.findOne({
          _id: id,
          isDeleted: { $ne: true },
        });

        if (!account) throw new UserInputError("Account not found");

        account.isActive = false;
        await account.save();

        return account;
      } catch (err) {
        console.error("DisableAccount Error:", err);

        if (err instanceof UserInputError) throw err;

        throw new ApolloError(err.message || "Failed to disable account");
      }
    },

    EnableAccount: async (_, { id }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);

      try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          throw new UserInputError("Invalid account id");
        }

        const account = await ACCOUNT.findOne({
          _id: id,
          isDeleted: { $ne: true },
        });

        if (!account) throw new UserInputError("Account not found");

        account.isActive = true;
        await account.save();

        return account;
      } catch (err) {
        console.error("EnableAccount Error:", err);

        if (err instanceof UserInputError) throw err;

        throw new ApolloError(err.message || "Failed to enable account");
      }
    },

    CreateMoneyIn: async (_, { data }, ctx) => {
  requireRoles(ctx, ["ADMIN", "MANAGER"]);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const amount = Number(data.amount);

    if (!amount || amount <= 0) {
      throw new UserInputError("Amount must be greater than 0");
    }

    if (!mongoose.Types.ObjectId.isValid(data.receivedToAccountId)) {
      throw new UserInputError("Invalid receivedToAccountId");
    }

    if (!mongoose.Types.ObjectId.isValid(data.incomeAccountId)) {
      throw new UserInputError("Invalid incomeAccountId");
    }

    const receivedTo = await ACCOUNT.findOne({
      _id: data.receivedToAccountId,
      type: "ASSET",
      isDeleted: { $ne: true },
      isActive: true,
    }).session(session);

    if (!receivedTo) {
      throw new UserInputError("Received To account must be active ASSET account");
    }

    const incomeAccount = await ACCOUNT.findOne({
      _id: data.incomeAccountId,
      type: "INCOME",
      isDeleted: { $ne: true },
      isActive: true,
    }).session(session);

    if (!incomeAccount) {
      throw new UserInputError("Income account must be active INCOME account");
    }
    const createdBy = ctx.user?._id || ctx.user?.id;

if (!createdBy || !mongoose.Types.ObjectId.isValid(createdBy)) {
  throw new UserInputError("Valid user context is required");
}


    const voucherNo =   await getNextNo("voucher", "JV", session);

    const [voucher] = await VOUCHER.create(
      [
        {
          voucherNo,
          type: "JOURNAL",
          date: data.date ? new Date(data.date) : new Date(),
          memo: data.memo || "Money In",
          status: "POSTED",
          createdBy: createdBy,
          sourceType: "MONEY_IN",
          sourceId: null,
          paymentMode: data.paymentMode || null,
        },
      ],
      { session }
    );

    await VOUCHER_LINE.insertMany(
      [
        {
          voucherId: voucher._id,
          accountId: receivedTo._id,
          debit: amount,
          credit: 0,
          memo: data.memo || "Money received",
          sourceType: "MONEY_IN",
          sourceId: null,
          paymentMode: data.paymentMode || null,
        },
        {
          voucherId: voucher._id,
          accountId: incomeAccount._id,
          debit: 0,
          credit: amount,
          memo: data.memo || "Other income",
          sourceType: "MONEY_IN",
          sourceId: null,
          paymentMode: data.paymentMode || null,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return voucher;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err instanceof UserInputError) throw err;
    if (err?.code === 11000) throw new UserInputError("Duplicate voucher number");

    throw new ApolloError(err.message || "Failed to create money in");
  }
},

CreateMoneyOut: async (_, { data }, ctx) => {
  requireRoles(ctx, ["ADMIN", "MANAGER"]);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const amount = Number(data.amount);

    if (!amount || amount <= 0) {
      throw new UserInputError("Amount must be greater than 0");
    }

    if (!mongoose.Types.ObjectId.isValid(data.paidFromAccountId)) {
      throw new UserInputError("Invalid paidFromAccountId");
    }

    if (!mongoose.Types.ObjectId.isValid(data.expenseAccountId)) {
      throw new UserInputError("Invalid expenseAccountId");
    }

    const paidFrom = await ACCOUNT.findOne({
      _id: data.paidFromAccountId,
      type: "ASSET",
      isDeleted: { $ne: true },
      isActive: true,
    }).session(session);

    if (!paidFrom) {
      throw new UserInputError("Paid From account must be active ASSET account");
    }

    const expenseAccount = await ACCOUNT.findOne({
      _id: data.expenseAccountId,
      type: "EXPENSE",
      isDeleted: { $ne: true },
      isActive: true,
    }).session(session);

    if (!expenseAccount) {
      throw new UserInputError("Expense account must be active EXPENSE account");
    }

    const voucherNo =  await getNextNo("voucher", "JV", session);

        const createdBy = ctx.user?._id || ctx.user?.id;

if (!createdBy || !mongoose.Types.ObjectId.isValid(createdBy)) {
  throw new UserInputError("Valid user context is required");
}


    const [voucher] = await VOUCHER.create(
      [
        {
          voucherNo,
          type: "JOURNAL",
          date: data.date ? new Date(data.date) : new Date(),
          memo: data.memo || "Money Out",
          status: "POSTED",
          createdBy: createdBy,
          sourceType: "MONEY_OUT",
          sourceId: null,
          paymentMode: data.paymentMode || null,
        },
      ],
      { session }
    );

    await VOUCHER_LINE.insertMany(
      [
        {
          voucherId: voucher._id,
          accountId: expenseAccount._id,
          debit: amount,
          credit: 0,
          memo: data.memo || "Expense paid",
          sourceType: "MONEY_OUT",
          sourceId: null,
          paymentMode: data.paymentMode || null,
        },
        {
          voucherId: voucher._id,
          accountId: paidFrom._id,
          debit: 0,
          credit: amount,
          memo: data.memo || "Paid from account",
          sourceType: "MONEY_OUT",
          sourceId: null,
          paymentMode: data.paymentMode || null,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return voucher;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err instanceof UserInputError) throw err;
    if (err?.code === 11000) throw new UserInputError("Duplicate voucher number");

    throw new ApolloError(err.message || "Failed to create money out");
  }
},

  },
};

export default accountResolvers;