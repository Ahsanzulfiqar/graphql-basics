import mongoose from "mongoose";
import {
  ApolloError,
  UserInputError,
} from "apollo-server-express";

import ACCOUNT from "../../models/Account.js";
import VOUCHER_LINE from "../../models/VoucherLine.js";

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
  },
};

export default accountResolvers;