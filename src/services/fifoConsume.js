import mongoose from "mongoose";
import WAREHOUSE_STOCK from "../models/WareHouseStock.js";



/**
 * FIFO consume batches by earliest expiry date first (no-expiry last)
 * Returns: [{ batchNo, expiryDate, qtyUsed }]
 */
export async function fifoConsume({ warehouseId, productId, variantId, qty }, session) {
  const q = {
    warehouse: new mongoose.Types.ObjectId(warehouseId),
    product: new mongoose.Types.ObjectId(productId),
  };
  if (variantId) q.variant = new mongoose.Types.ObjectId(variantId);

  const stock = await WAREHOUSE_STOCK.findOne(q).session(session);
  if (!stock) throw new Error("Warehouse stock record not found");

  const available = (stock.quantity || 0) - (stock.reserved || 0);
  if (available < qty) throw new Error(`Insufficient stock. Available=${available}, Required=${qty}`);

  const sorted = (stock.batches || []).slice().sort((a, b) => {
    const ax = a.expiryDate ? new Date(a.expiryDate).getTime() : Number.POSITIVE_INFINITY;
    const bx = b.expiryDate ? new Date(b.expiryDate).getTime() : Number.POSITIVE_INFINITY;
    if (ax !== bx) return ax - bx;
    return String(a.batchNo || "").localeCompare(String(b.batchNo || ""));
  });

  let remaining = qty;
  const used = [];

  for (const b of sorted) {
    if (remaining <= 0) break;

    const bQty = Number(b.quantity || 0);
    if (bQty <= 0) continue;

    const take = Math.min(bQty, remaining);

    // Deduct from actual embedded array
    const target = stock.batches.find(
      (x) =>
        (x.batchNo || "") === (b.batchNo || "") &&
        String(x.expiryDate || "") === String(b.expiryDate || "")
    );

    if (!target) continue;

    target.quantity = Number((target.quantity - take).toFixed(6));
    remaining -= take;

    used.push({ batchNo: b.batchNo, expiryDate: b.expiryDate, qtyUsed: take });
  }

  if (remaining > 0) throw new Error("Batch quantities mismatch/insufficient for FIFO");

  stock.quantity = Number((stock.quantity - qty).toFixed(6));
  stock.batches = (stock.batches || []).filter((x) => Number(x.quantity || 0) > 0);

  await stock.save({ session });
  return used;
}

