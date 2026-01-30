

import validator from "validator";
import PRODUCT from "../../models/Product.js";
import PRODUCTVARIANT from "../../models/ProductVarient.js";




const productResolvers = {
  Query: {
    
     // ✅ Get all products
    GetAllProducts: async () => {
      try {
        const products = await PRODUCT.find();
        return products;
      } catch (error) {
        console.error("Error fetching products:", error);
        throw new Error("Failed to get products");
      }
    },
      // ✅ Get single product by Mongo _id
    GetProductById: async (_, { _id }) => {
      try {
        const product = await PRODUCT.findById(_id);
        if (!product) {
          throw new Error("Product not found");
        }
        return product;
      } catch (error) {
        console.error("Error fetching product:", error);
        throw new Error("Failed to get product");
      }
    },

  GetVariantsByProduct: async (_, { productId }) => {
      try {
        const variants = await PRODUCTVARIANT.find({ product: productId }).sort({ createdAt: -1 });
        return variants;
      } catch (err) {
        console.error("GetVariantsByProduct error:", err);
        throw new Error("Failed to fetch variants for this product");
      }
    },

    GetVariantById: async (_, { _id }) => {
      try {
        const variant = await PRODUCTVARIANT.findById(_id);
        if(variant)
          return variant
          else throw new Error("Variant not found");
        
        
      } catch (err) {
        console.error("GetVariantById error:", err);
        throw new Error("Failed to fetch variant");
      }
    },


   
  },


  Mutation: {

       // ✅ Create Product
    CreateProduct: async (_, { data }) => {
      try {

         const newProduct = await PRODUCT.create({
          name: data.name,
          brand: data.brand,
          sku: data.sku,
          barcode: data.barcode,
          description: data.description,
          category: data.category,
          subCategory: data.subCategory,
          purchasePrice: data.purchasePrice,
          salePrice: data.salePrice,
          attributes: data.attributes,
          isActive: data.isActive,
          images: data.images,
        });

        return newProduct;
      } catch (error) {
        console.error("Error creating product:", error);
        throw new Error("Failed to create product");
      }
    },


     // ✅ Update Product
    UpdateProduct: async (_, { _id, data }) => {
      try {
    
        const updatedProduct = await PRODUCT.findByIdAndUpdate(
          _id,
          { $set: data },
          { new: true }
        );

        if (!updatedProduct) throw new Error("Product not found");
        return updatedProduct;
      } catch (error) {
        console.error("Error updating product:", error);
        throw new Error("Failed to update product");
      }
    },

     CreateProductVariant: async (_, { data }) => {
      console.log("inside")
      const {
        productId,
        name,
        sku,
        barcode,
        purchasePrice,
        salePrice,
        attributes,
        packSize,
        netWeight,
        isActive,
        images,
      } = data;

      // Validate parent product exists
      const product = await PRODUCT.findById(productId);
      if (!product) {
        throw new Error("Parent product not found");
      }
// console.log(product,"product")
      // Create variant
      try {
        const variant = await PRODUCTVARIANT.create({
          product: productId,
          name,
          sku,
          barcode,
          purchasePrice,
          salePrice,
          attributes: attributes || [],
          packSize,
          netWeight,
          isActive: typeof isActive === "boolean" ? isActive : true,
          images: images || [],
        });

        return variant;
      } catch (err) {
        // Common issues: duplicate SKU
        console.error("CreateProductVariant error:", err);
        if (err.code === 11000) {
          throw new Error("SKU already exists");
        }
        console.log(err)
        throw new Error("Failed to create product variant");
      }
    },

       // UPDATE
    UpdateProductVariant: async (_, { _id, data }) => {
      // Optional: if productId is sent, validate it
    if (data && data.productId) {
        const exists = await PRODUCT.findById(data.productId);
        if (!exists) {
          throw new Error("New parent product not found");
        }
      }

      try {
        const updated = await PRODUCTVARIANT.findByIdAndUpdate(
          _id,
          {
            $set: {
              ...(data.productId ? { product: data.productId } : {}),
              ...(data.name !== undefined ? { name: data.name } : {}),
              ...(data.sku !== undefined ? { sku: data.sku } : {}),
              ...(data.barcode !== undefined ? { barcode: data.barcode } : {}),
              ...(data.purchasePrice !== undefined ? { purchasePrice: data.purchasePrice } : {}),
              ...(data.salePrice !== undefined ? { salePrice: data.salePrice } : {}),
              ...(data.attributes !== undefined ? { attributes: data.attributes } : {}),
              ...(data.packSize !== undefined ? { packSize: data.packSize } : {}),
              ...(data.netWeight !== undefined ? { netWeight: data.netWeight } : {}),
              ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
              ...(data.images !== undefined ? { images: data.images } : {}),
            },
          },
          { new: true, runValidators: true }
        );

        if (!updated) throw new Error("Variant not found");
        return updated;
      } catch (err) {
        console.error("UpdateProductVariant error:", err);
        if (err.code === 11000) {
          throw new Error("SKU already exists");
        }
        throw new Error("Failed to update product variant");
      }
    },
  




    


  
  },

  Subscription: {
    newMessage: {
      subscribe(parent, args, { pubsub }, info) {
        return pubsub.asyncIterator("MESSAGE");
      },
    },
  },
};


export default productResolvers;