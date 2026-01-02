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



export async function reserveStock({ warehouseId, productId, variantId, qty }, session) {
  const q = {
    warehouse: new mongoose.Types.ObjectId(warehouseId),
    product: new mongoose.Types.ObjectId(productId),
  };
  if (variantId) q.variant = new mongoose.Types.ObjectId(variantId);

  const stock = await WAREHOUSE_STOCK.findOne(q).session(session);
  if (!stock) throw new Error("Warehouse stock record not found");

  const available = (stock.quantity || 0) - (stock.reserved || 0);
  if (available < qty) {
    throw new Error(`Insufficient stock to reserve. Available=${available}, Required=${qty}`);
  }

  stock.reserved = (stock.reserved || 0) + qty;
  await stock.save({ session });
}

export async function releaseReservedStock({ warehouseId, productId, variantId, qty }, session) {
  const q = {
    warehouse: new mongoose.Types.ObjectId(warehouseId),
    product: new mongoose.Types.ObjectId(productId),
  };
  if (variantId) q.variant = new mongoose.Types.ObjectId(variantId);

  const stock = await WAREHOUSE_STOCK.findOne(q).session(session);
  if (!stock) throw new Error("Warehouse stock record not found");

  stock.reserved = Math.max(0, (stock.reserved || 0) - qty);
  await stock.save({ session });
}



export async function addBackToBatch(
  { warehouseId, productId, variantId, qty, batchNo, expiryDate },
  session
) {
  const q = {
    warehouse: new mongoose.Types.ObjectId(warehouseId),
    product: new mongoose.Types.ObjectId(productId),
  };
  if (variantId) q.variant = new mongoose.Types.ObjectId(variantId);

  let stock = await WAREHOUSE_STOCK.findOne(q).session(session);

  if (!stock) {
    // create if missing
    const created = await WAREHOUSE_STOCK.create(
      [
        {
          warehouse: warehouseId,
          product: productId,
          variant: variantId,
          quantity: qty,
          reserved: 0,
          reorderLevel: 0,
          batches: batchNo
            ? [{ batchNo, expiryDate: expiryDate ? new Date(expiryDate) : undefined, quantity: qty }]
            : [],
        },
      ],
      { session }
    );
    return created[0];
  }

  stock.quantity = Number((stock.quantity + qty).toFixed(6));

  if (batchNo) {
    stock.batches = stock.batches || [];
    const found = stock.batches.find(
      (b) =>
        (b.batchNo || "") === (batchNo || "") &&
        String(b.expiryDate || "") === String(expiryDate || "")
    );

    if (found) found.quantity = Number((found.quantity + qty).toFixed(6));
    else stock.batches.push({ batchNo, expiryDate: expiryDate ? new Date(expiryDate) : undefined, quantity: qty });
  }

  await stock.save({ session });
  return stock;
}





