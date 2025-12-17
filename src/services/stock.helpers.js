import WAREHOUSE_STOCK from "../models/WareHouseStock.js"; // wareHouseStock
import mongoose from "mongoose";

/**
 * Adjusts warehouseStock for a single movement.
 * deltaQty = +N (incoming) or -N (outgoing).
 */
export async function applyStockMovement(
  {
    warehouse,
    product,
    variant,
    batchNo,
    expiryDate,
    deltaQty,
  },
  session
) {
  if (!deltaQty || deltaQty === 0) return;

  const query = {
    warehouse: new mongoose.Types.ObjectId(warehouse),
    product: new mongoose.Types.ObjectId(product),
  };

  if (variant) query.variant = new mongoose.Types.ObjectId(variant);

  const stock = await WAREHOUSE_STOCK.findOne(query).session(session);

  if (!stock) {
    // Only create if incoming > 0
    if (deltaQty < 0) {
      throw new Error("Cannot reduce stock: record does not exist");
    }

    const doc = await WAREHOUSE_STOCK.create(
      [
        {
          warehouse,
          product,
          variant,
          quantity: deltaQty,
          batches: batchNo
            ? [
                {
                  batchNo,
                  expiryDate: expiryDate ? new Date(expiryDate) : undefined,
                  quantity: deltaQty,
                },
              ]
            : [],
        },
      ],
      { session }
    );

    return doc[0];
  }

  // adjust main quantity
  stock.quantity += deltaQty;
  if (stock.quantity < 0) {
    throw new Error("Resulting stock would be negative");
  }

  // adjust batches if batch specified
  if (batchNo) {
    const existingBatch = stock.batches.find(
      (b) =>
        b.batchNo === batchNo &&
        String(b.expiryDate || "") === String(expiryDate || "")
    );

    if (existingBatch) {
      existingBatch.quantity += deltaQty;
      if (existingBatch.quantity < 0) {
        throw new Error("Resulting batch stock would be negative");
      }
      // optionally remove empty batch:
      stock.batches = stock.batches.filter((b) => b.quantity > 0);
    } else if (deltaQty > 0) {
      stock.batches.push({
        batchNo,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        quantity: deltaQty,
      });
    } else {
      throw new Error(
        `Cannot reduce stock for missing batch ${batchNo} (no existing batch)`
      );
    }
  }

  await stock.save({ session });
  return stock;
}
