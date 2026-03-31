import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import axios from "axios";
import { User, Admin, Cart, Payment, Product, CatalogProduct, PurchaseHistory, CatalogCategory } from "./models";
import paymentsRouter from "./routes/payments";

dotenv.config();

const app = express();
// CORS: allow requests from the frontend origins and ensure preflight responses
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:8080";
const ALLOWED_ORIGINS = [
  FRONTEND_URL,
  'https://legitstorez.com',
  'https://www.legitstorez.com',
  'https://legitstore.vercel.app',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:4001',
  'http://localhost:4000',
  'http://localhost:5173'
].filter(Boolean);

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // allow non-browser requests (e.g., curl) with no origin set
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions as any));

// Ensure explicit preflight handling for all routes (important on some platforms)
app.options('*', cors(corsOptions as any));

// Fallback middleware: set CORS headers when origin is allowed (helps when a proxy
// or other middleware short-circuits and removes headers)
app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  // respond immediately to OPTIONS
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

// Payment routes (Ercaspay integration)
app.use("/api/payments", paymentsRouter);

const PORT = parseInt(process.env.PORT || "4000", 10);
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
const MONGODB_URL = process.env.MONGODB_URL || "mongodb://localhost:27017/joybuy";
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET || "";

// We'll start the server after connecting to MongoDB (so startup failures surface immediately)

type JwtAdminPayload = {
  adminId: string;
  email?: string;
  iat?: number;
  exp?: number;
};

type AdminRequest = Request & { admin?: JwtAdminPayload };

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Missing authorization" });
  const parts = auth.split(" ");
  const token = parts.length === 2 ? parts[1] : parts[0];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtAdminPayload;
    if (!payload || !payload.adminId) return res.status(403).json({ error: "Not authorized" });
    // attach to request object in a type-safe way
  (req as AdminRequest).admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

async function start() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URL);
    console.log("MongoDB connected successfully");
    
    // Seed default categories if none exist
    const categoryCount = await CatalogCategory.countDocuments();
    if (categoryCount === 0) {
      const defaultCategories = [
        { id: "audio", name: "Audio" },
        { id: "wearables", name: "Wearables" },
        { id: "computers", name: "Computers" },
        { id: "mobile", name: "Mobile" },
        { id: "accessories", name: "Accessories" },
        { id: "gaming", name: "Gaming" },
        { id: "smart-home", name: "Smart Home" },
        { id: "storage", name: "Storage" },
        { id: "cameras", name: "Cameras" },
        { id: "other", name: "Other" },
      ];
      await CatalogCategory.insertMany(defaultCategories);
      console.log("Default categories seeded to database");
    }

    // Ensure indexes needed for Buy History queries (important for Atlas scale)
    try {
      await PurchaseHistory.collection.createIndex({ purchaseDate: -1 });
      await PurchaseHistory.collection.createIndex({ email: 1, purchaseDate: -1 });
      await PurchaseHistory.collection.createIndex({ userId: 1, purchaseDate: -1 });
      console.log("PurchaseHistory indexes ensured");
    } catch (e) {
      console.warn("Failed to ensure PurchaseHistory indexes:", e);
    }
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on all interfaces, port ${PORT}`);
      console.log(`Try accessing: http://localhost:${PORT}/api/health`);
    }).on('error', (error: Error) => {
      console.error("Failed to start server:", error);
      console.error("Port:", PORT);
      console.error("Error details:", error.message);
      process.exit(1);
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  }
}

// Admin login
app.post("/api/admin/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing fields" });
    const admin = await Admin.findOne({ email }).exec();
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });
    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ adminId: admin._id, email: admin.email }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: "Failed to login" });
  }
});

// User registration
app.post("/api/auth/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    
    // Check if user already exists
    const existingUser = await User.findOne({ email }).exec();
    if (existingUser) return res.status(400).json({ error: "Email already registered" });
    
    // Hash password (8 rounds = faster but still secure)
    const hashedPassword = await bcrypt.hash(password, 8);
    
    // Create user
    const user = await User.create({
      email,
      password: hashedPassword,
      name: name || undefined,
      balance: 0
    });
    
    res.json({ 
      ok: true, 
      user: { 
        id: user._id, 
        email: user.email, 
        name: user.name,
        balance: user.balance 
      } 
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Failed to register user" });
  }
});

// User login
app.post("/api/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    
    const user = await User.findOne({ email }).exec();
    if (!user || !user.password) return res.status(401).json({ error: "Invalid credentials" });
    
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });
    
    res.json({ 
      ok: true, 
      user: { 
        id: user._id, 
        email: user.email, 
        name: user.name,
        balance: user.balance 
      } 
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Failed to login" });
  }
});

// Users
app.get("/api/users", requireAdmin, async (req: Request, res: Response) => {
  try {
    console.log("Fetching users...");
    const users = await User.find().lean();
    console.log(`Found ${users.length} users`);
    res.json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Get current user data by ID (for balance refresh)
app.get("/api/users/current/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      balance: user.balance || 0
    });
  } catch (err) {
    console.error("Error fetching current user:", err);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

app.get("/api/users/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = await User.findById(id).lean();
  if (!user) return res.status(404).json({ error: "Not found" });
  const carts = await Cart.find({ user: user._id }).lean();
  const payments = await Payment.find({ user: user._id }).lean();
  res.json({ ...user, carts, payments });
});

app.delete("/api/users/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "User not found" });
    
    // Delete associated data
    await Cart.deleteMany({ user: user._id });
    await Payment.deleteMany({ user: user._id });
    
    // Delete the user
    await User.findByIdAndDelete(id);
    
    res.json({ ok: true, message: "User deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// Adjust user balance (admin only - for manual cash payments)
app.post("/api/users/:id/adjust-balance", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const { amount } = req.body;
    
    if (typeof amount !== 'number' || amount === 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: "User not found" });
    
    // Update balance
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $inc: { balance: amount } },
      { new: true }
    );
    
    // Create a payment record for tracking
    await Payment.create({
      user: id,
      amount: Math.abs(amount),
      method: "cash",
      status: "completed",
      reference: `MANUAL_${Date.now()}`,
      isCredited: true,
    });
    
    res.json({ 
      ok: true, 
      message: `Balance ${amount > 0 ? 'increased' : 'decreased'} successfully`,
      newBalance: updatedUser?.balance || 0
    });
  } catch (err) {
    console.error("Error adjusting balance:", err);
    res.status(500).json({ error: "Failed to adjust balance" });
  }
});

// Payments
app.get("/api/payments", requireAdmin, async (req: Request, res: Response) => {
  const payments = await Payment.find().populate("user").lean();
  res.json(payments);
});

// Get payments for a specific user
app.get("/api/payments/user/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const payments = await Payment.find({ user: userId }).sort({ createdAt: -1 }).lean();
    res.json(payments);
  } catch (err) {
    console.error("Error fetching user payments:", err);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

app.delete("/api/payments/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const payment = await Payment.findById(id);
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    
    await Payment.findByIdAndDelete(id);
    
    res.json({ ok: true, message: "Payment deleted successfully" });
  } catch (err) {
    console.error("Error deleting payment:", err);
    res.status(500).json({ error: "Failed to delete payment" });
  }
});

// Carts
app.get("/api/carts", requireAdmin, async (req: Request, res: Response) => {
  const carts = await Cart.find().populate("user").lean();
  res.json(carts);
});

// Products
app.get("/api/products", async (req: Request, res: Response) => {
  try {
    const isAdmin = req.headers.authorization?.startsWith("Bearer ");
    const projection = isAdmin ? '-imageUrl' : '-imageUrl -items';
    const products = await Product.find().select(projection).lean();
    res.json(products);
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// Get product image
app.get("/api/products/:id/image", async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id).select('imageUrl').lean();
    if (!product || !product.imageUrl) {
      return res.status(404).send("Image not found");
    }

    const matches = product.imageUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const buffer = Buffer.from(matches[2], 'base64');
      res.set('Content-Type', matches[1]);
      res.set('Cache-Control', 'public, max-age=31536000');
      return res.send(buffer);
    }
    
    // Fallback if not base64
    if (product.imageUrl.startsWith("http")) return res.redirect(product.imageUrl);
    res.send(product.imageUrl);

  } catch (err) {
    console.error("Error fetching product image:", err);
    res.status(500).json({ error: "Failed to fetch image" });
  }
});

app.post("/api/products", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, price, description, category, imageUrl } = req.body;
    if (!name || !price) return res.status(400).json({ error: "Name and price are required" });
    
    const product = await Product.create({
      name,
      price,
      description,
      category,
      imageUrl,
      items: []
    });
    
    res.json(product);
  } catch (err) {
    console.error("Error creating product:", err);
    res.status(500).json({ error: "Failed to create product" });
  }
});

app.put("/api/products/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, price, description, category, imageUrl } = req.body;
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { name, price, description, category, imageUrl },
      { new: true }
    );
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    console.error("Error updating product:", err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

app.delete("/api/products/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json({ ok: true, message: "Product deleted successfully" });
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

// Product Items (account credentials)
app.post("/api/products/:id/items", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { username, password, twoFactorAuth, emailAddress, recoveryPassword } = req.body;
    if (!username || !password || !emailAddress) {
      return res.status(400).json({ error: "Username, password, and email are required" });
    }
    
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    
    product.items.push({
      username,
      password,
      twoFactorAuth,
      emailAddress,
      recoveryPassword,
      isSold: false
    });
    
    await product.save();
    res.json(product);
  } catch (err) {
    console.error("Error adding item:", err);
    res.status(500).json({ error: "Failed to add item" });
  }
});

app.delete("/api/products/:productId/items/:itemId", requireAdmin, async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    
    product.items = product.items.filter(item => item._id?.toString() !== req.params.itemId);
    await product.save();
    
    res.json({ ok: true, message: "Item deleted successfully" });
  } catch (err) {
    console.error("Error deleting item:", err);
    res.status(500).json({ error: "Failed to delete item" });
  }
});

app.patch("/api/products/:productId/items/:itemId/sold", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { isSold } = req.body;
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    
    const item = product.items.find(item => item._id?.toString() === req.params.itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });
    
    item.isSold = isSold;
    if (!isSold) {
      item.soldTo = undefined;
      item.soldAt = undefined;
    }
    
    await product.save();
    res.json(product);
  } catch (err) {
    console.error("Error updating item status:", err);
    res.status(500).json({ error: "Failed to update item status" });
  }
});

// Health check
app.get("/api/health", (req: Request, res: Response) => {
  console.log("Health check endpoint hit");
  const state = mongoose.connection.readyState; // 0 disconnected, 1 connected
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  res.json({ status: states[state] || "unknown", uptime: process.uptime() });
});

// ======== CATALOG PRODUCT ENDPOINTS ========

// Get all catalog products
app.get("/api/catalog", async (req: Request, res: Response) => {
  try {
    const products = await CatalogProduct.find().select('-image -serialNumbers').lean();
    res.json(products);
  } catch (err) {
    console.error("Error fetching catalog products:", err);
    res.status(500).json({ error: "Failed to fetch catalog products" });
  }
});

// Get catalog product image
app.get("/api/catalog/:id/image", async (req: Request, res: Response) => {
  try {
    const product = await CatalogProduct.findOne({ id: req.params.id }).select('image').lean();
    if (!product || !product.image) {
      return res.status(404).send("Image not found");
    }

    const matches = product.image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const buffer = Buffer.from(matches[2], 'base64');
      res.set('Content-Type', matches[1]);
      res.set('Cache-Control', 'public, max-age=31536000');
      return res.send(buffer);
    }
    
    // Fallback if not base64
    if (product.image.startsWith("http")) return res.redirect(product.image);
    res.send(product.image);

  } catch (err) {
    console.error("Error fetching catalog product image:", err);
    res.status(500).json({ error: "Failed to fetch image" });
  }
});

// Create catalog product (admin only)
app.post("/api/catalog", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id, name, description, price, image, category } = req.body;
    if (!id || !name || !description || !price || !image || !category) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const product = new CatalogProduct({
      id,
      name,
      description,
      price,
      image,
      category,
      serialNumbers: [],
    });
    await product.save();
    res.json(product);
  } catch (err) {
    console.error("Error creating catalog product:", err);
    res.status(500).json({ error: "Failed to create catalog product" });
  }
});

// Update catalog product (admin only)
app.put("/api/catalog/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const product = await CatalogProduct.findOneAndUpdate(
      { id },
      updates,
      { new: true }
    );
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json(product);
  } catch (err) {
    console.error("Error updating catalog product:", err);
    res.status(500).json({ error: "Failed to update catalog product" });
  }
});

// Delete catalog product (admin only)
app.delete("/api/catalog/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const product = await CatalogProduct.findOneAndDelete({ id });
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    console.error("Error deleting catalog product:", err);
    res.status(500).json({ error: "Failed to delete catalog product" });
  }
});

// ======== CATALOG CATEGORY ENDPOINTS ========

// Get all categories
app.get("/api/catalog-categories", async (req: Request, res: Response) => {
  try {
    const cats = await CatalogCategory.find().sort({ name: 1 }).lean();
    res.json(cats);
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// Create category (admin)
app.post("/api/catalog-categories", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id, name } = req.body as { id?: string; name?: string };
    if (!name) return res.status(400).json({ error: "Name is required" });
    const cat = new CatalogCategory({ id: id || crypto.randomUUID(), name });
    await cat.save();
    res.json(cat);
  } catch (err) {
    console.error("Error creating category:", err);
    res.status(500).json({ error: "Failed to create category" });
  }
});

// Delete category (admin)
app.delete("/api/catalog-categories/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await CatalogCategory.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ error: "Category not found" });
    res.json({ message: "Category deleted" });
  } catch (err) {
    console.error("Error deleting category:", err);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

// ======== PURCHASE HISTORY ENDPOINTS ========

// Get purchase history for a user
app.get("/api/purchase-history/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const history = await PurchaseHistory.find({ userId }).sort({ purchaseDate: -1 }).lean();
    res.json(history);
  } catch (err) {
    console.error("Error fetching purchase history:", err);
    res.status(500).json({ error: "Failed to fetch purchase history" });
  }
});

// Create purchase history entry
app.post("/api/purchase-history", async (req: Request, res: Response) => {
  try {
    const { userId, email, productId, name, description, price, image, category, quantity, assignedSerials } = req.body;
    if (!userId || !email || !productId || !name || !price || !quantity) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const purchase = new PurchaseHistory({
      userId,
      email,
      productId,
      name,
      description,
      price,
      image,
      category,
      quantity,
      assignedSerials: assignedSerials || [],
      softDeleted: false
    });
    await purchase.save();
    res.json(purchase);
  } catch (err) {
    console.error("Error creating purchase history:", err);
    res.status(500).json({ error: "Failed to create purchase history" });
  }
});

// Complete purchase (deduct balance, update product, create history)
app.post("/api/purchase/complete", async (req: Request, res: Response) => {
  try {
    const { userId, productId, quantity, serialUpdates, purchaseData } = req.body;
    
    console.log("Purchase request received:", { userId, productId, quantity });
    
    if (!userId || !productId || !quantity || !purchaseData) {
      console.error("Missing required fields:", { userId, productId, quantity, purchaseData });
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get user and check balance
    const user = await User.findById(userId).exec();
    if (!user) {
      console.error("User not found:", userId);
      return res.status(404).json({ error: "User not found" });
    }

    const totalPrice = purchaseData.price * quantity;
    if ((user.balance || 0) < totalPrice) {
      console.error("Insufficient balance:", { balance: user.balance, required: totalPrice });
      return res.status(400).json({ error: "Insufficient balance" });
    }

    console.log("Creating purchase history...");
    // Create purchase history first
    const purchase = new PurchaseHistory({
      userId: purchaseData.userId,
      email: purchaseData.email,
      productId: purchaseData.productId,
      name: purchaseData.name,
      description: purchaseData.description,
      price: purchaseData.price,
      image: purchaseData.image,
      category: purchaseData.category,
      quantity: purchaseData.quantity,
      assignedSerials: purchaseData.assignedSerials || [],
    });
    await purchase.save();
    console.log("Purchase history created successfully");

    // Update product serial numbers if provided (support both _id and custom id field)
    let updatedCatalogProduct: any = null;
    if (serialUpdates && serialUpdates.length > 0) {
      console.log("Updating product serial numbers...");
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(productId);
      try {
        if (isValidObjectId) {
          // Try _id first
          updatedCatalogProduct = await CatalogProduct.findByIdAndUpdate(
            productId,
            { serialNumbers: serialUpdates },
            { new: true }
          ).exec();
        }
        // If not valid ObjectId or not found via _id, fall back to custom id field
        if (!updatedCatalogProduct) {
          updatedCatalogProduct = await CatalogProduct.findOneAndUpdate(
            { id: productId },
            { serialNumbers: serialUpdates },
            { new: true }
          ).exec();
        }
        if (updatedCatalogProduct) {
          console.log("Serial numbers updated successfully for catalog product", updatedCatalogProduct.id || updatedCatalogProduct._id);
        } else {
          console.log("Catalog product not found for serial update", productId);
        }
      } catch (e) {
        console.error("Error updating serial numbers", e);
      }
    }

    // Deduct balance from user last (after everything else succeeds)
    console.log("Deducting balance...");
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: -totalPrice } },
      { new: true }
    ).exec();
    console.log("Balance deducted successfully. New balance:", updatedUser?.balance);

    res.json({
      success: true,
      newBalance: updatedUser?.balance || 0,
      purchase,
      updatedProduct: updatedCatalogProduct ? {
        id: updatedCatalogProduct.id || updatedCatalogProduct._id?.toString(),
        serialNumbers: updatedCatalogProduct.serialNumbers || []
      } : null
    });
  } catch (err) {
    console.error("Error completing purchase:", err);
    res.status(500).json({ error: "Failed to complete purchase", details: err instanceof Error ? err.message : String(err) });
  }
});

// Get all purchase history (admin only) - shows ALL purchases including user-deleted for business records
app.get("/api/purchase-history", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { email } = req.query as { email?: string };
    const filter: Record<string, any> = {};
    if (email && email.trim().length > 0) {
      // Case-insensitive partial match from start or anywhere
      // Using regex enables admin to type partial email and see matches
      filter.email = { $regex: email.trim(), $options: "i" };
    }
    try {
      const items = await PurchaseHistory.find(filter).sort({ purchaseDate: -1 }).lean();
      res.json(items);
      return;
    } catch (err: any) {
      // If the collection is large and indexes are still building/missing, Mongo can exceed the 32MB in-memory sort cap.
      // Fall back to aggregation with allowDiskUse to avoid a hard 500.
      const code = err?.code;
      const codeName = err?.codeName;
      const msg = typeof err?.message === "string" ? err.message : "";
      const isSortMemoryError = code === 292 || codeName === "QueryExceededMemoryLimitNoDiskUseAllowed" || msg.includes("Sort exceeded memory limit");
      if (!isSortMemoryError) throw err;

      const items = await PurchaseHistory.aggregate([
        { $match: filter },
        { $sort: { purchaseDate: -1 } },
      ]).allowDiskUse(true);
      res.json(items);
      return;
    }
  } catch (err) {
    console.error("Error fetching all purchase history:", err);
    res.status(500).json({ error: "Failed to fetch purchase history" });
  }
});

// Note: Deletion endpoints removed to simplify UX; users can no longer delete purchase history entries

// Health check
app.get("/api/health", (req: Request, res: Response) => {
  console.log("Health check endpoint hit");
  const state = mongoose.connection.readyState; // 0 disconnected, 1 connected
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  res.json({ ok: state === 1, mongoState: states[state] ?? state, uptime: process.uptime() });
  console.log("Health check response sent");
});


// Initialize Paystack transaction
app.post("/api/payments/initialize", async (req: Request, res: Response) => {
  const { amount, email, userId } = req.body;
  if (!amount || !email || !userId) return res.status(400).json({ error: "Missing fields" });
  const reference = `ref_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  try {
    // create pending payment record
    const payment = await Payment.create({ user: userId, amount, method: "card", status: "pending", reference });
    // call Paystack initialize
    const resp = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      { email, amount: Math.round(amount * 100), reference },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    res.json({ authorization_url: resp.data.data.authorization_url, reference, paymentId: payment._id });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error(err.response?.data ?? err.message);
    } else if (err instanceof Error) {
      console.error(err.message);
    } else {
      console.error(err);
    }
    res.status(500).json({ error: "Failed to initialize payment" });
  }
});

// Credit Ercas payment (client-side confirmation when redirected back with status=PAID&transRef=...)
app.post("/api/payments/ercas/credit", async (req: Request, res: Response) => {
  try {
    const { userId, email, transRef, status, amount } = req.body as { userId?: string; email?: string; transRef?: string; status?: string; amount?: number };
    
    if (!userId || !transRef || !status) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }
    
    if (status !== "PAID") {
      return res.status(400).json({ ok: false, error: "Payment status is not PAID" });
    }

    // First, check if this payment already exists and is credited
    let payment = await Payment.findOne({ transactionReference: transRef }).exec();
    
    if (payment && payment.isCredited) {
      // Already credited - return success with existing balance
      const user = await User.findById(payment.user).exec();
      return res.json({ 
        ok: true, 
        credited: false, 
        alreadyProcessed: true,
        amount: payment.amount, 
        newBalance: user?.balance,
        message: "Payment already credited" 
      });
    }

    // Resolve the user
    let realUser = await User.findById(userId).exec();
    if (!realUser && email) {
      realUser = await User.findOne({ email }).exec();
    }
    
    if (!realUser) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    let resolvedAmount = amount;

    // If no payment record exists, try to find a pending one
    if (!payment) {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
      const pending = await Payment.findOne({ 
        user: realUser._id, 
        method: { $in: ["ercas", "ercaspay"] }, 
        status: { $ne: "success" },
        isCredited: false,
        createdAt: { $gte: thirtyMinsAgo } 
      }).sort({ createdAt: -1 }).exec();
      
      if (pending) {
        payment = pending;
        resolvedAmount = pending.amount;
      }
    }

    // Create payment record if still not found
    if (!payment) {
      if (!resolvedAmount || resolvedAmount <= 0) {
        return res.status(400).json({ ok: false, error: "Invalid or missing amount" });
      }
      
      payment = new Payment({
        user: realUser._id,
        amount: resolvedAmount,
        method: "ercas",
        status: "success",
        transactionReference: transRef,
        reference: transRef,
        isCredited: false,
      });
    } else {
      // Update existing payment
      payment.status = "success";
      payment.transactionReference = transRef;
      payment.reference = transRef;
      if (!resolvedAmount || resolvedAmount <= 0) {
        resolvedAmount = payment.amount;
      }
    }

    // Credit the user account
    const updatedUser = await User.findByIdAndUpdate(
      realUser._id, 
      { $inc: { balance: resolvedAmount } }, 
      { new: true }
    ).exec();

    if (!updatedUser) {
      return res.status(500).json({ ok: false, error: "Failed to update user balance" });
    }

    // Mark as credited and save
    payment.isCredited = true;
    await payment.save();

    return res.json({ 
      ok: true, 
      credited: true, 
      alreadyProcessed: false,
      amount: resolvedAmount, 
      newBalance: updatedUser.balance,
      message: "Payment credited successfully" 
    });
    
  } catch (err) {
    console.error("Ercas credit error:", err);
    return res.status(500).json({ ok: false, error: "Failed to process payment" });
  }
});

// Verify Paystack transaction
// Robust verification endpoint: accepts path or various query param names (reference, pref, ref, transRef)
app.get("/api/payments/verify/:reference?", async (req: Request, res: Response) => {
  const passed = req.params.reference
    || (req.query.reference as string | undefined)
    || (req.query.pref as string | undefined)
    || (req.query.ref as string | undefined)
    || (req.query.transRef as string | undefined);
  if (!passed) return res.status(400).json({ error: "Missing reference" });
  try {
    // Call Paystack with whatever reference we were given
    const resp = await axios.get(`https://api.paystack.co/transaction/verify/${passed}`, { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } });
    const { status, amount } = resp.data.data; // amount in kobo

    // Attempt to locate Payment by internal reference first, then by transactionReference
    let payment = await Payment.findOne({ reference: passed }).exec();
    if (!payment) {
      payment = await Payment.findOne({ transactionReference: passed }).exec();
    }

    if (!payment) {
      // No payment record, still return status so client can decide next step
      return res.json({ ok: true, status, amount: amount / 100, newBalance: undefined, paymentFound: false });
    }

    // Update status
    payment.status = status === "success" ? "completed" : status;

    let newBalance: number | undefined = undefined;
    if (payment.status === "completed" && !payment.isCredited && payment.user) {
      const creditedAmount = amount / 100;
      const updatedUser = await User.findByIdAndUpdate(payment.user, { $inc: { balance: creditedAmount } }, { new: true }).exec();
      if (updatedUser) {
        newBalance = updatedUser.balance || 0;
        payment.isCredited = true;
      }
    }
    await payment.save();
    res.json({ ok: true, status: payment.status, amount: amount / 100, newBalance, alreadyCredited: payment.isCredited, paymentFound: true });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error("Paystack verify error:", err.response?.data ?? err.message);
      return res.status(500).json({ error: "Verification failed", details: err.response?.data ?? err.message });
    } else if (err instanceof Error) {
      console.error("Verify error:", err.message);
      return res.status(500).json({ error: "Verification failed", details: err.message });
    } else {
      console.error("Unknown verify error:", err);
      return res.status(500).json({ error: "Verification failed" });
    }
  }
});

// Start the server (after connecting to MongoDB)
start();
