import { gql } from "graphql-tag";

const accountTypeDefs = gql`
  scalar Date

  type Query {
    GetAccounts(
      search: String
      type: AccountType
      isActive: Boolean
    ): [Account!]!

    GetAccountById(id: ID!): Account!
    GetAccountTree: [Account!]!

    GetVouchers(
      from: Date
      to: Date
      status: VoucherStatus
    ): [Voucher!]!

    GetVoucherById(id: ID!): VoucherDetail!

    GetTrialBalance(
      from: Date
      to: Date
    ): TrialBalanceReport!
  }

  type Mutation {
    SeedDefaultAccounts: [Account!]!

    CreateAccount(data: CreateAccountInput!): Account!

    UpdateAccount(
      id: ID!
      data: UpdateAccountInput!
    ): Account!

    DeleteAccount(id: ID!): Boolean!
    DisableAccount(id: ID!): Account!
    EnableAccount(id: ID!): Account!

    CreateMoneyIn(data: CreateMoneyInInput!): Voucher!
    CreateMoneyOut(data: CreateMoneyOutInput!): Voucher!
  }

  enum AccountType {
    ASSET
    LIABILITY
    INCOME
    EXPENSE
    EQUITY
  }

  enum VoucherType {
    JOURNAL
    PURCHASE
    PAYMENT
  }

  enum VoucherStatus {
    DRAFT
    POSTED
    VOID
  }



  enum VoucherSourceType {
  MANUAL
  SALE
  SALE_PAYMENT
  PURCHASE
  PURCHASE_PAYMENT
  MONEY_IN
  MONEY_OUT
  EXPENSE
  STOCK_ADJUSTMENT
  OPENING_BALANCE
  SALES_RETURN
  PURCHASE_RETURN
  SALE_COGS
}


  enum PaymentMode {
    COD
    ONLINE
  }

  type Account {
    _id: ID!
    name: String!
    code: String
    type: AccountType!
    parentId: ID
    isActive: Boolean!
    isDeleted: Boolean
    children: [Account!]
    createdAt: Date
    updatedAt: Date
  }

  input CreateAccountInput {
    name: String!
    code: String
    type: AccountType!
    parentId: ID
    isActive: Boolean
  }

  input UpdateAccountInput {
    name: String
    code: String
    type: AccountType
    parentId: ID
    isActive: Boolean
  }

  input CreateMoneyInInput {
    date: Date

    # Existing generic income flow
    receivedToAccountId: ID!
    incomeAccountId: ID

    # New Phase 2 sale settlement flow
    saleId: ID
    customerId: ID

    amount: Float!
    memo: String
    paymentMode: PaymentMode
  }

  input CreateMoneyOutInput {
    date: Date

    # Existing generic expense flow
    paidFromAccountId: ID!
    expenseAccountId: ID

    # New Phase 2 purchase settlement flow
    purchaseId: ID
    supplierId: ID

    amount: Float!
    memo: String
    paymentMode: PaymentMode
  }

  input VoucherLineInput {
    accountId: ID!
    debit: Float
    credit: Float
    memo: String
  }

  input CreateVoucherInput {
    date: Date!
    memo: String
    lines: [VoucherLineInput!]!
  }

  type Voucher {
    _id: ID!
    voucherNo: String!
    type: VoucherType!
    date: Date!
    memo: String
    status: VoucherStatus!
    createdBy: ID!
    voidReason: String
    voidAt: Date
    sourceType: VoucherSourceType
    sourceId: ID
    paymentMode: PaymentMode
    createdAt: Date
    updatedAt: Date
  }

  type VoucherLine {
    _id: ID!
    voucherId: ID!
    accountId: ID!
    debit: Float!
    credit: Float!
    memo: String
    sourceType: VoucherSourceType
    sourceId: ID
    paymentMode: PaymentMode
    createdAt: Date
    updatedAt: Date
  }

  type VoucherDetail {
    voucher: Voucher!
    lines: [VoucherLine!]!
  }

  type TrialBalanceRow {
    accountId: ID!
    accountCode: String
    accountName: String!
    accountType: AccountType!
    debitTotal: Float!
    creditTotal: Float!
    balance: Float!
  }

  type TrialBalanceReport {
    from: Date
    to: Date
    rows: [TrialBalanceRow!]!
    totalDebit: Float!
    totalCredit: Float!
    isBalanced: Boolean!
  }
`;

export default accountTypeDefs;