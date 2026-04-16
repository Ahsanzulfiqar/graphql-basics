import WAREHOUSE_STOCK from "../models/WareHouseStock.js"; // wareHouseStock
import mongoose from "mongoose";

/**
 * Adjusts warehouseStock for a single movement.
 * deltaQty = +N (incoming) or -N (outgoing).
 */
export async function applyStockMovement(
  { warehouse, product, variant, batchNo, expiryDate, deltaQty, purchasePrice = 0 },
  session
) {
  if (!deltaQty || deltaQty === 0) return;

  const warehouseId = new mongoose.Types.ObjectId(warehouse);
  const productId = new mongoose.Types.ObjectId(product);

  const query = variant
    ? {
        warehouse: warehouseId,
        product: productId,
        variant: new mongoose.Types.ObjectId(variant),
      }
    : {
        warehouse: warehouseId,
        product: productId,
        $or: [{ variant: { $exists: false } }, { variant: null }],
      };

  const stock = await WAREHOUSE_STOCK.findOne(query).session(session);

  // normalize expiryDate for safe compare
  const exp = expiryDate ? new Date(expiryDate) : null;
  const expKey = exp ? exp.toISOString().slice(0, 10) : ""; // YYYY-MM-DD

  // CREATE NEW STOCK ROW
  if (!stock) {
    if (deltaQty < 0) {
      throw new Error("Cannot reduce stock: record does not exist");
    }

    const incomingQty = Number(deltaQty || 0);
    const incomingPrice = Number(purchasePrice || 0);

    const payload = {
      warehouse: warehouseId,
      product: productId,
      quantity: incomingQty,
      reserved: 0,
      reorderLevel: 0,
      avgCost: incomingPrice,
      batches: [],
    };

    if (variant) {
      payload.variant = new mongoose.Types.ObjectId(variant);
    }

    if (batchNo) {
      payload.batches.push({
        batchNo,
        expiryDate: exp || undefined,
        quantity: incomingQty,
      });
    }

    const doc = await WAREHOUSE_STOCK.create([payload], { session });
    return doc[0];
  }

  // STOCK IN
  if (deltaQty > 0) {
    const oldQty = Number(stock.quantity || 0);
    const oldAvgCost = Number(stock.avgCost || 0);
    const incomingQty = Number(deltaQty || 0);
    const incomingPrice = Number(purchasePrice || 0);

    const totalQty = oldQty + incomingQty;

    const newAvgCost =
      totalQty > 0
        ? Number(
            (
              (oldQty * oldAvgCost + incomingQty * incomingPrice) / totalQty
            ).toFixed(4)
          )
        : 0;

    stock.quantity = totalQty;
    stock.avgCost = newAvgCost;

    if (batchNo) {
      const existingBatch = stock.batches.find((b) => {
        const bKey = b.expiryDate
          ? new Date(b.expiryDate).toISOString().slice(0, 10)
          : "";
        return b.batchNo === batchNo && bKey === expKey;
      });

      if (existingBatch) {
        existingBatch.quantity = Number(existingBatch.quantity || 0) + incomingQty;
      } else {
        stock.batches.push({
          batchNo,
          expiryDate: exp || undefined,
          quantity: incomingQty,
        });
      }
    }
  }

  // STOCK OUT
  else if (deltaQty < 0) {
    const outgoingQty = Math.abs(Number(deltaQty || 0));

    if (Number(stock.quantity || 0) < outgoingQty) {
      throw new Error("Resulting stock would be negative");
    }

    stock.quantity = Number(stock.quantity || 0) - outgoingQty;

    if (batchNo) {
      const existingBatch = stock.batches.find((b) => {
        const bKey = b.expiryDate
          ? new Date(b.expiryDate).toISOString().slice(0, 10)
          : "";
        return b.batchNo === batchNo && bKey === expKey;
      });

      if (!existingBatch) {
        throw new Error(`Cannot reduce stock for missing batch ${batchNo}`);
      }

      existingBatch.quantity = Number(existingBatch.quantity || 0) - outgoingQty;

      if (existingBatch.quantity < 0) {
        throw new Error("Resulting batch stock would be negative");
      }

      stock.batches = stock.batches.filter((b) => Number(b.quantity || 0) > 0);
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





