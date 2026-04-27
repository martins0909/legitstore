import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { apiFetch, catalogAPI, purchaseHistoryAPI, catalogCategoriesAPI, API_BASE } from "@/lib/api";
import { Banknote, ChevronDown, History, Copy, Menu, Wallet as WalletIcon, Activity, Loader2, Download } from "lucide-react";
import bannerImg from "@/assets/banner.jpg";
import { Plus, Wallet, LogOut, BadgeCheck, X, ShoppingCart, Minus, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
// Removed demo product assets; shop now shows only database products

interface SerialNumber {
  id: string;
  serial: string;
  isUsed: boolean;
  usedBy?: string;
  usedAt?: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  description: string;
  category: string;
  serialNumbers?: SerialNumber[];
  stockCount?: number;
}

// --- Live Activity Implementation ---
type ActivityAction = "buy" | "deposit";

interface LiveActivity {
  id: string;
  user: string;
  action: ActivityAction;
  detail: string;
  description?: string;
  amount: number;
  timestamp: number;
  timeString: string;
}

const generateRandomUser = () => {
  const names = ['kin', 'pre', 'had', 'con', 'jam', 'ola', 'sam', 'ada', 'chi', 'vic', 'lex', 'max', 'jon', 'ben'];
  return names[Math.floor(Math.random() * names.length)] + '***';
};

const getRandomTimeAgo = () => {
  const times = ["just now", "1 minute ago", "3 minutes ago", "5 minutes ago", "30 minutes ago", "2 hours ago", "yesterday"];
  return times[Math.floor(Math.random() * times.length)];
};

interface PurchaseHistoryItem extends Product {
  purchaseDate: string;
  quantity: number;
  productId?: string;
  assignedSerials?: string[]; // Array of serial numbers assigned to this purchase
}

// Basic user shape for typing localStorage data. Additional dynamic keys allowed as unknown.
interface User {
  id: string;
  email: string;
  name?: string;
  balance?: number;
  [key: string]: unknown;
}

type MobileSection = "fund" | "category" | "order" | "deposit";

const initialProducts: Product[] = [];

const Shop = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const [user, setUser] = useState<User | null>(null);
  // Phone Prompt for existing users
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);
  const [phonePromptValue, setPhonePromptValue] = useState("");

  const [addFundsAmount, setAddFundsAmount] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showBuyDialog, setShowBuyDialog] = useState(false);
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isCreatingTopup, setIsCreatingTopup] = useState(false);
  const [isVerifyingTopup, setIsVerifyingTopup] = useState(false);
  const [showPurchaseHistory, setShowPurchaseHistory] = useState(false);
  const [showDepositHistory, setShowDepositHistory] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [processedTransactions, setProcessedTransactions] = useState<Set<string>>(new Set());
  // Track if Ercas redirect has been processed in this session
  const [ercasRedirectProcessed, setErcasRedirectProcessed] = useState(false);
  const [depositHistory, setDepositHistory] = useState<Array<{
    _id?: string;
    amount?: number;
    method?: string;
    status?: string;
    createdAt: string;
    reference?: string;
  }>>([]);
  
  // Live Activities State
  const [liveActivities, setLiveActivities] = useState<LiveActivity[]>([]);
  // Add a tick state to force re-render components tracking timestamp formatTimeAgo every minute
  const [, setTick] = useState(0);

  // Fetch deposit history (payments)
  const loadDepositHistory = async (userId: string) => {
    try {
      const res = await apiFetch(`/api/payments/user/${userId}`);
      setDepositHistory(res as Array<{
        _id?: string;
        amount?: number;
        method?: string;
        status?: string;
        createdAt: string;
        reference?: string;
      }>);
    } catch (e) {
      setDepositHistory([]);
    }
  };
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [loadingProducts, setLoadingProducts] = useState(true);
  // Categories from API
  const [categories, setCategories] = useState<string[]>(["All"]);

  // New: Purchase summary dialog state
  const [showPurchaseSummaryDialog, setShowPurchaseSummaryDialog] = useState(false);
  const [purchaseSummaryData, setPurchaseSummaryData] = useState<{
    product: Product | null;
    quantity: number;
    serials: string[];
    balanceBefore: number;
    balanceAfter: number;
  } | null>(null);
  // Manual add funds dialog (mobile)
  const [showManualAddFundsDialog, setShowManualAddFundsDialog] = useState(false);
  const [showAddFundsFlow, setShowAddFundsFlow] = useState(false);
  const [addFundsStep, setAddFundsStep] = useState<"amount" | "method">("amount");
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [showVADialog, setShowVADialog] = useState(false);
  const [vaDetails, setVaDetails] = useState<{ accountNumber: string; bankName: string; accountName: string } | null>(null);
  const [isProcessingVA, setIsProcessingVA] = useState(false);
  const [activeMobileSection, setActiveMobileSection] = useState<MobileSection>("fund");
  const walletSectionRef = useRef<HTMLDivElement | null>(null);
  const walletInputRef = useRef<HTMLInputElement | null>(null);
  const searchQuery = searchParams.get("search")?.trim().toLowerCase() || "";
  const categoryQuery = searchParams.get("category")?.trim() || "All";

  useEffect(() => {
    const currentUser = localStorage.getItem("currentUser");
    if (!currentUser) {
      navigate("/auth");
      return;
    }
    // Safely parse user data to avoid crashing the app if storage is corrupted
    let parsedUser: User | null = null;
    try {
      parsedUser = JSON.parse(currentUser) as User;
    } catch (e) {
      // If parsing fails, reset and send user to auth
      console.error("Invalid currentUser in localStorage; clearing and redirecting", e);
      localStorage.removeItem("currentUser");
      navigate("/auth");
      return;
    }
    setUser(parsedUser);

    // Hydrate from prefetch cache immediately if available, for snappy UI
    try {
      const cachedProds = sessionStorage.getItem("prefetch_products");
      const cachedCats = sessionStorage.getItem("prefetch_categories");
      if (cachedProds) {
        const prods = JSON.parse(cachedProds) as Product[];
        setProducts(prods);
        setLoadingProducts(false);
      }
      if (cachedCats) {
        const cats = JSON.parse(cachedCats) as Array<{ name: string }>;
        setCategories(["All", ...cats.map(c => c.name)]);
      }
      // Clear caches after hydration to avoid stale data next session
      sessionStorage.removeItem("prefetch_products");
      sessionStorage.removeItem("prefetch_categories");
    } catch { /* ignore cache errors */ }

    // Load products/categories (parallel) and then purchase history (deferred)
    loadProductsAndHistory(parsedUser.id);
    loadDepositHistory(parsedUser.id);
  }, [navigate]);

  // Periodically refresh user balance from backend (every 10 seconds)
  const refreshBalance = async () => {
    if (!user) return;
    try {
      const res = await apiFetch(`/api/users/current/${user.id}`);
      const userData = res as { id: string; email: string; name?: string; balance: number };
      
      // Only update if balance has changed
      if (userData.balance !== user.balance) {
        const updatedUser = { ...user, balance: userData.balance };
        setUser(updatedUser);
        localStorage.setItem("currentUser", JSON.stringify(updatedUser));
      }
    } catch (e) {
      // Silently fail - user can still use the app with cached balance
      console.error("Failed to refresh balance:", e);
    }
  };

  useEffect(() => {
    if (!user) return;

    // Refresh immediately on mount, then every 10 seconds
    refreshBalance();
    const interval = setInterval(refreshBalance, 10000);

    return () => clearInterval(interval);
  }, [user, ercasRedirectProcessed, processedTransactions]);

  const loadProductsAndHistory = async (userId: string) => {
    try {
      setLoadingProducts(true);

      // Fetch products and categories in parallel with a soft timeout
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const [catalogProducts, cats] = await Promise.all([
        catalogAPI.getAll(),
        catalogCategoriesAPI.getAll(),
      ]);
      clearTimeout(timer);

  setProducts(catalogProducts);
      setCategories(["All", ...cats.map(c => c.name)]);
      
      // Defer purchase history so UI renders fast
      (async () => {
        try {
          const history = await purchaseHistoryAPI.getByUserId(userId);
          setPurchaseHistory(history.map(h => ({
            id: h.productId,
            name: h.name,
            description: h.description,
            price: h.price,
            image: h.image,
            category: h.category,
            quantity: h.quantity,
            assignedSerials: h.assignedSerials,
            purchaseDate: h.purchaseDate.toString()
          })));
        } catch (e) {
          console.error("Failed to load purchase history", e);
        }
      })();
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load products");
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleBuyClick = (product: Product) => {
    setSelectedProduct(product);
    setPurchaseQuantity(1);
    setShowBuyDialog(true);
  };

  const handleCancelPurchase = () => {
    setShowBuyDialog(false);
    setSelectedProduct(null);
    setPurchaseQuantity(1);
  };

  const handleConfirmPurchase = async () => {
    if (!selectedProduct || !user || isPurchasing) return;

    const totalPrice = selectedProduct.price * purchaseQuantity;
    const balanceBefore = Math.max(0, user.balance || 0);

    if (Math.max(0, user.balance || 0) < totalPrice) {
      toast.error("Insufficient balance. Please add funds to your wallet.");
      setShowBuyDialog(false);
      setSelectedProduct(null);
      setPurchaseQuantity(1);
      return;
    }

    // Set loading state to prevent duplicate purchases
    setIsPurchasing(true);

    // Check if enough serial numbers are available
    const availableStock = selectedProduct.serialNumbers 
        ? selectedProduct.serialNumbers.filter(s => !s.isUsed).length 
        : (selectedProduct.stockCount || 0);

    if (availableStock < purchaseQuantity) {
      toast.error(`Only ${availableStock} units available in stock.`);
      return;
    }

    try {
      // Complete purchase via backend (deducts balance, updates product, creates history)
      const result = await purchaseHistoryAPI.completePurchase({
        userId: user.id,
        productId: selectedProduct.id,
        quantity: purchaseQuantity,
        purchaseData: {
          userId: user.id,
          email: user.email,
          productId: selectedProduct.id,
          name: selectedProduct.name,
          description: selectedProduct.description,
          price: selectedProduct.price,
          image: selectedProduct.image,
          category: selectedProduct.category,
          quantity: purchaseQuantity,
          assignedSerials: []
        }
      });

      const assignedSerialNumbers = result.purchase?.assignedSerials || [];

      // Update local state with new balance from backend
      const updatedUser: User = { ...user, balance: result.newBalance };
      setUser(updatedUser);
      localStorage.setItem("currentUser", JSON.stringify(updatedUser));
      
      const usersRaw = JSON.parse(localStorage.getItem("users") || "[]") as User[];
      const updatedUsers = usersRaw.map(u => u.id === user.id ? updatedUser : u);
      localStorage.setItem("users", JSON.stringify(updatedUsers));

      // Update local products state using authoritative backend response
      const updatedProducts = products.map(p => {
        if (p.id === selectedProduct.id) {
          const updatedStock = (result as any).updatedProduct?.stockCount;
          return {
            ...p,
            stockCount: updatedStock !== undefined ? updatedStock : p.stockCount
          };
        }
        return p;
      });
      setProducts(updatedProducts);
      
      // Reload purchase history
      const history = await purchaseHistoryAPI.getByUserId(user.id);
      setPurchaseHistory(history.map(h => ({
        id: h.productId,
        name: h.name,
        description: h.description,
        price: h.price,
        image: h.image,
        category: h.category,
        quantity: h.quantity,
        assignedSerials: h.assignedSerials,
        purchaseDate: h.purchaseDate.toString()
      })));

      // Show purchase summary dialog
      setPurchaseSummaryData({
        product: selectedProduct,
        quantity: purchaseQuantity,
        serials: assignedSerialNumbers,
        balanceBefore,
        balanceAfter: result.newBalance
      });
      setShowPurchaseSummaryDialog(true);

      setShowBuyDialog(false);
      setSelectedProduct(null);
      setPurchaseQuantity(1);
    } catch (error: unknown) {
      console.error("Error processing purchase:", error);
      setIsPurchasing(false);
      const errorMessage = error && typeof error === 'object' && 'response' in error 
        ? (error as { response?: { data?: { error?: string } } }).response?.data?.error 
        : error instanceof Error 
        ? error.message 
        : "Failed to complete purchase. Please try again.";
      toast.error(errorMessage);
      
      // Refresh user balance from server in case of error
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/users/current/${user.id}`);
        if (response.ok) {
          const data = await response.json();
          const refreshedUser = { ...user, balance: data.balance };
          setUser(refreshedUser);
          localStorage.setItem("currentUser", JSON.stringify(refreshedUser));
        }
      } catch (refreshError) {
        console.error("Error refreshing balance:", refreshError);
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  useEffect(() => {
    // Generate initial live activities when products load
    if (products.length > 0 && liveActivities.length === 0) {
      const now = Date.now();
      const initialActivities: LiveActivity[] = Array.from({ length: 6 }).map((_, i) => {
        const isDeposit = Math.random() > 0.6;
        const timeOffset = now - (Math.floor(Math.random() * 60) * 60000) - (i * 55 * 60000); // spread across random past hours
        
        let detail = "Ercas Pay";
        let amount = Math.floor(Math.random() * 45000) + 1000;
        let description = undefined;
        
        if (!isDeposit) {
          const randomProduct = products[Math.floor(Math.random() * products.length)];
          detail = randomProduct.name;
          amount = randomProduct.price;
          // Add a short snippet of the product description
          description = randomProduct.description ? randomProduct.description.substring(0, 40) + "..." : "Premium quality social account";
        }
        
        return {
          id: `init-${i}-${Math.random()}`,
          user: generateRandomUser(),
          action: isDeposit ? "deposit" : "buy",
          detail,
          description,
          amount,
          timestamp: timeOffset,
          timeString: getRandomTimeAgo()
        };
      });
      // push to top properly, sorted descending time
      setLiveActivities(initialActivities.sort((a,b) => b.timestamp - a.timestamp));
    }
  }, [products]);

  useEffect(() => {
    let tickInterval: ReturnType<typeof setInterval>;
    let generatorTimer: ReturnType<typeof setTimeout>;

    // Ticker to refresh timeago strings every minute
    tickInterval = setInterval(() => setTick(t => t + 1), 60000);
    
    // Auto-update loop (push a new activity constantly between 3-7 seconds to look busy)
    const runGenerator = () => {
      const nextDelay = Math.floor(Math.random() * 4000) + 3000; 
      
      generatorTimer = setTimeout(() => {
        if (products.length > 0) {
          setLiveActivities(prev => {
            const isDeposit = Math.random() > 0.7; // 30% chance deposit, 70% chance buy
            let detail = "Ercas Pay";
            let amount = Math.floor(Math.random() * 45000) + 1000;
            let description = undefined;
            
            if (!isDeposit && products.length > 0) {
              const randomProduct = products[Math.floor(Math.random() * products.length)];
              detail = randomProduct.name;
              amount = randomProduct.price;
              description = randomProduct.description ? randomProduct.description.substring(0, 40) + "..." : "Premium quality social account";
            }

            const newActivity: LiveActivity = {
              id: `live-${Date.now()}-${Math.random()}`,
              user: generateRandomUser(),
              action: isDeposit ? "deposit" : "buy",
              detail,
              description,
              amount,
              timestamp: Date.now(),
              timeString: getRandomTimeAgo()
            };

            // keep latest 6
            const newArray = [newActivity, ...prev].slice(0, 6);
            return newArray;
          });
        }
        runGenerator(); // recursively call next one
      }, nextDelay);
    };

    if (products.length > 0) {
       runGenerator();
    }
    
    return () => {
      clearInterval(tickInterval);
      clearTimeout(generatorTimer);
    };
  }, [products]);

  // Group products by category
  const filteredProducts = products.filter((product) => {
    if (!searchQuery) return true;

    const haystack = [product.name, product.description, product.category]
      .join(" ")
      .toLowerCase();

    return haystack.includes(searchQuery);
  });

  const groupedProducts = filteredProducts.reduce((acc, product) => {
    if (!acc[product.category]) {
      acc[product.category] = [];
    }
    acc[product.category].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  // Get categories that have products (excluding "All")
  const categoriesWithProducts = categories.filter(cat => cat !== "All" && groupedProducts[cat]?.length > 0);
  const shopCategoryMenuItems = categoriesWithProducts.map((category) => ({
    name: category,
    image: groupedProducts[category]?.[0] ? 
           (groupedProducts[category][0].image || `${API_BASE}/api/catalog/${groupedProducts[category][0].id}/image`) : 
           bannerImg,
    productCount: groupedProducts[category]?.length || 0,
  }));
  const completedDeposits = depositHistory.filter((entry) => {
    const normalizedStatus = (entry.status || "").toLowerCase();
    return normalizedStatus === "completed" || normalizedStatus === "success" || normalizedStatus === "successful";
  });

  useEffect(() => {
    if (activeCategory !== "All" && !groupedProducts[activeCategory]?.length) {
      setActiveCategory("All");
    }
  }, [activeCategory, groupedProducts]);

  useEffect(() => {
    if (!categoryQuery || categoryQuery === "All") {
      setActiveCategory("All");
      return;
    }

    const matchedCategory = categories.find((category) => category.toLowerCase() === categoryQuery.toLowerCase());
    setActiveCategory(matchedCategory || "All");
  }, [categoryQuery, categories]);

  // Function to toggle category expansion
  const toggleCategoryExpansion = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Function to get products to display for a category (5 or all)
  const getProductsToDisplay = (category: string) => {
    const products = groupedProducts[category] || [];
    const isExpanded = expandedCategories[category];
    return isExpanded ? products : products.slice(0, 5);
  };

  // Function to scroll to category section
  const scrollToCategory = (category: string) => {
    if (category === "All") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const element = document.getElementById(`category-${category}`);
      if (element) {
        const offset = 100; // Offset for fixed header
        const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
        window.scrollTo({ top: elementPosition - offset, behavior: "smooth" });
      }
    }
  };

  const handleCategoryNavigation = (category: string) => {
    setActiveMobileSection("category");
    setActiveCategory(category);
    scrollToCategory(category);
    setShowCategorySheet(false);
  };

  const handleMobileFundClick = () => {
    setActiveMobileSection("fund");
    setAddFundsStep("amount");
    setShowAddFundsFlow(true);
  };

  const formatPrice = (price: number) => (Number.isInteger(price) ? price : price.toFixed(2));

  const renderShopProductRow = (product: Product, index: number = 0) => {
    const availableStock = product.serialNumbers ? product.serialNumbers.filter(serial => !serial.isUsed).length : (product.stockCount || 0);
    const isOutOfStock = availableStock === 0;

    return (
      <motion.article 
        key={product.id} 
        initial={{ opacity: 0, y: 15 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.3) }}
        className="border-t border-slate-200 px-4 py-3 first:border-t-0 md:px-6 dark:border-white/5"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-900/40 md:h-12 md:w-12">
              <img
                src={product.image || `${API_BASE}/api/catalog/${product.id}/image`}
                alt={product.name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 md:text-base">{product.name}</h4>
              </div>
              <p className="mt-1.5 text-xs leading-5 text-slate-600 dark:text-slate-300 md:text-sm">{product.description}</p>
            </div>
          </div>

          <div className="ml-auto grid w-full max-w-[320px] grid-cols-[72px_minmax(92px,1fr)_78px] items-center justify-items-center gap-3 border-t border-slate-200 pt-3 text-center md:ml-0 md:min-w-[338px] md:w-auto md:grid-cols-[84px_110px_112px] md:gap-4 md:border-t-0 md:pt-0 dark:border-white/5">
            <div className="flex w-full justify-center">
              <div className={`mt-1 inline-flex min-w-[66px] items-center justify-center rounded-full px-2.5 py-1 text-sm font-semibold ${isOutOfStock ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" : "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"}`}>
                {availableStock}pcx
              </div>
            </div>

            <div className="flex w-full justify-center">
              <div className="mt-1 inline-flex min-w-[92px] items-center justify-center rounded-full bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700 dark:bg-slate-800/40 dark:text-slate-200">
                ₦{formatPrice(product.price)}
              </div>
            </div>

            <div className="flex w-full justify-center">
              <Button
                onClick={() => handleBuyClick(product)}
                disabled={isOutOfStock}
                className={`mt-1 h-7 w-full max-w-[78px] rounded-full px-2 text-[11px] font-semibold text-white md:h-8 md:max-w-none md:px-3 md:text-sm ${isOutOfStock ? "bg-slate-400 hover:bg-slate-400 dark:bg-slate-700 dark:hover:bg-slate-700" : "bg-blue-600 hover:bg-blue-500"}`}
              >
                {isOutOfStock ? "Out" : "Buy"}
              </Button>
            </div>
          </div>
        </div>
      </motion.article>
    );
  };

  const renderCategoryBlock = (category: string, blockIndex: number = 0) => {
    const categoryProducts = groupedProducts[category] || [];
    const displayedProducts = getProductsToDisplay(category);
    const hasMore = categoryProducts.length > 5;
    const isExpanded = expandedCategories[category];

    return (
      <motion.div 
        key={category} 
        id={`category-${category}`} 
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5, delay: Math.min(blockIndex * 0.1, 0.4) }}
        className="scroll-mt-24 border-y border-slate-200 bg-[#f8fbff] dark:border-white/5 dark:bg-black/20 backdrop-blur-md"
      >
        <div className="bg-blue-700 px-4 py-2 text-white md:px-6 md:py-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-lg font-bold md:text-2xl">{category}</h3>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => toggleCategoryExpansion(category)}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-100 transition-colors hover:text-white md:text-sm"
                >
                  <span>{isExpanded ? "Show Less" : "See More"}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
            <div className="mt-1 ml-auto inline-grid w-full max-w-[320px] grid-cols-[72px_minmax(92px,1fr)_78px] items-center justify-items-center gap-3 self-end rounded-full border border-white/35 bg-white/28 px-3 py-1.5 text-center shadow-[0_8px_20px_rgba(15,23,42,0.12)] backdrop-blur-md md:mt-2 md:ml-0 md:min-w-[338px] md:w-auto md:grid-cols-[84px_110px_112px] md:gap-4 md:px-4">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white md:text-xs md:tracking-[0.22em]">Stock</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white md:text-xs md:tracking-[0.22em]">Price</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white md:text-xs md:tracking-[0.22em]">Action</span>
            </div>
          </div>
        </div>

        <div>
          {displayedProducts.map((product, idx) => renderShopProductRow(product, idx))}
        </div>
      </motion.div>
    );
  };

  const getMobileNavClasses = (section: MobileSection) => {
    const isActive = activeMobileSection === section;

    return {
      button: `relative flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 transition-colors duration-300 ${isActive ? "bg-blue-50 text-blue-700 dark:bg-slate-800 dark:text-blue-300" : "text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-800"}`,
      icon: `flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-300 ${isActive ? "bg-blue-100 text-blue-700 dark:bg-slate-700 dark:text-blue-300" : "bg-blue-100 text-blue-700 dark:bg-slate-800 dark:text-blue-300"}`,
      label: "text-[10px] font-semibold leading-none",
    };
  };

  const getDepositMethodLabel = (entry: { method?: string; reference?: string }) => {
    const normalizedMethod = (entry.method || "").toLowerCase();
    const normalizedReference = (entry.reference || "").toLowerCase();

    if (normalizedMethod === "cash" || normalizedMethod === "manual" || normalizedReference.startsWith("manual_")) {
      return "Manual";
    }

    return "ERCASPAY";
  };

  useEffect(() => {
    if (showCategorySheet) {
      setActiveMobileSection("category");
    }
  }, [showCategorySheet]);

  useEffect(() => {
    if (showPurchaseHistory) {
      setActiveMobileSection("order");
    }
  }, [showPurchaseHistory]);

  useEffect(() => {
    if (showDepositHistory) {
      setActiveMobileSection("deposit");
    }
  }, [showDepositHistory]);

  const handleAddFunds = async (phoneOrEvent?: string | any) => {
    const amount = parseFloat(addFundsAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    const phoneFromPrompt = typeof phoneOrEvent === 'string' ? phoneOrEvent : undefined;

    // Show loading state
    setIsCreatingTopup(true);

    try {
      // Create payment session
      const res = await apiFetch("/api/payments/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          currency: "NGN",
          userId: user!.id,
          email: user!.email,
          phone: phoneFromPrompt,
          // Include amount in callback so we can recover if localStorage missing
          callbackUrl: `${window.location.origin}/shop?ercasAmount=${amount}`,
        }),
      });

      const { checkoutUrl, paymentReference, transactionReference, virtualAccount } = res as {
        checkoutUrl: string;
        paymentReference: string;
        transactionReference: string | null;
        virtualAccount?: { accountNumber: string; bankName: string; accountName: string };
      };

      // Store reference for later verification
      localStorage.setItem("latest_topup", JSON.stringify({
        paymentReference,
        transactionReference: transactionReference || null,
        amount,
        createdAt: Date.now(),
      }));

      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        toast.error("Failed to generate checkout URL. Please try again.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start payment";
      
      // If PocketFi complains about phone number, show prompt
      if (msg.toLowerCase().includes("phone must be 11 digits") || msg.toLowerCase().includes("phone number is required")) {
        setShowPhonePrompt(true);
      } else {
        toast.error(msg);
      }
    } finally {
      setIsCreatingTopup(false);
    }
  };

  const handleVADone = () => {
    setIsProcessingVA(true);
    setTimeout(() => {
      setIsProcessingVA(false);
      setShowVADialog(false);
      refreshBalance();
    }, 2000);
  };

  // On return from payment provider, auto-resume verification if we see our reference in URL
  useEffect(() => {
    if (!user) return;

    const params = new URLSearchParams(window.location.search);
    let pref = params.get("pref");
    const ercasStatus = params.get("status");
    const ercasTransRef = params.get("transRef");
    const ercasAmountParam = params.get("ercasAmount");

    // Handle Ercas redirect first (status=PAID & transRef present, no pref)
    if (!pref && ercasStatus === "PAID" && ercasTransRef) {
      const handledKey = `ercas_handled_${ercasTransRef}`;
      const processingKey = `ercas_processing_${ercasTransRef}`;

      // If we've already handled this transRef before (even across refreshes), skip and clean URL
      if (sessionStorage.getItem(handledKey) === '1' || processedTransactions.has(ercasTransRef) || ercasRedirectProcessed) {
        console.log("Ercas redirect already handled. Skipping.", ercasTransRef);
        const url = new URL(window.location.href);
        url.searchParams.delete("status");
        url.searchParams.delete("transRef");
        url.searchParams.delete("ercasAmount");
        window.history.replaceState({}, "", url.toString());
        return;
      }

      // Mark as processed for this session
  setErcasRedirectProcessed(true);
  setProcessedTransactions(prev => new Set(prev).add(ercasTransRef));
  // Mark as processing in this browser session (survives refresh)
  sessionStorage.setItem(processingKey, '1');

      (async () => {
        setIsVerifyingTopup(true);
        try {
          const storedRaw = localStorage.getItem("latest_topup");
          let amount: number | undefined = undefined;

          // Get amount from localStorage or URL param
          if (storedRaw) {
            try {
              const parsed = JSON.parse(storedRaw) as { amount?: number };
              amount = parsed.amount;
            } catch { /* ignore */ }
          }
          if ((!amount || amount <= 0) && ercasAmountParam) {
            const parsed = parseFloat(ercasAmountParam);
            if (!isNaN(parsed) && parsed > 0) amount = parsed;
          }

          // Call backend to credit
          const creditRes = await apiFetch("/api/payments/ercas/credit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: user!.id,
              email: user!.email,
              transRef: ercasTransRef,
              status: ercasStatus,
              amount
            }),
          });

          const { ok, credited, alreadyProcessed, newBalance, amount: backendAmount, error, message } = creditRes as {
            ok: boolean;
            credited: boolean;
            alreadyProcessed?: boolean;
            newBalance?: number;
            amount?: number;
            error?: string;
            message?: string;
          };

          if (ok && (credited || alreadyProcessed)) {
            const finalAmount = backendAmount ?? amount ?? 0;

            // CRITICAL: Use newBalance from backend directly - it's already the correct final balance
            if (typeof newBalance === 'number') {
              const updatedUser: User = { ...user!, balance: newBalance };
              setUser(updatedUser);
              localStorage.setItem("currentUser", JSON.stringify(updatedUser));

              if (alreadyProcessed) {
                toast.info("Payment already processed.");
              } else {
                toast.success(`₦${finalAmount.toFixed(2)} added to your wallet!`);
              }
            } else {
              toast.error("Balance update failed. Please refresh the page.");
            }

            // Mark handled, clear processing flag and cleanup URL params IMMEDIATELY after processing
            sessionStorage.setItem(handledKey, '1');
            sessionStorage.removeItem(processingKey);
            const url = new URL(window.location.href);
            url.searchParams.delete("status");
            url.searchParams.delete("transRef");
            url.searchParams.delete("ercasAmount");
            window.history.replaceState({}, "", url.toString());
            localStorage.removeItem("latest_topup");
          } else {
            toast.error(error || message || "Failed to process payment");
            // Clear processing flag on failure so user can retry
            sessionStorage.removeItem(processingKey);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Payment processing error";
          toast.error(msg);
        } finally {
          setIsVerifyingTopup(false);
        }
      })();
      return; // Skip Paystack flow
    }
    if (!pref) return;
    // Clean pref if provider appended extra query like '?reference='
    if (pref.includes('?') || pref.includes('&')) {
      pref = pref.split('?')[0].split('&')[0];
    }
    
    // Auto-verify using the paymentReference from URL
    (async () => {
      setIsVerifyingTopup(true);
      try {
        // Prefer gateway transactionReference saved earlier, fallback to paymentReference from URL
        const stored = localStorage.getItem("latest_topup");
        let referenceForVerify = pref;
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as { transactionReference?: string | null; paymentReference?: string };
            if (parsed?.transactionReference) referenceForVerify = parsed.transactionReference;
          } catch {
            // Ignore JSON parse errors
          }
        }
        // Response shape from verification endpoints
        type VerifyResponse = {
          status: string;
          amount: number;
          newBalance?: number;
          alreadyCredited?: boolean;
          paymentFound?: boolean;
          details?: unknown;
        };
        let res: VerifyResponse | undefined;
        try {
          // Primary attempt: path param
          res = await apiFetch(`/api/payments/verify/${encodeURIComponent(referenceForVerify)}`);
        } catch (e) {
          // Fallback: query param style
          res = await apiFetch(`/api/payments/verify?reference=${encodeURIComponent(referenceForVerify)}`);
        }
  if (!res) throw new Error("Empty verification response");
  const { status, amount, newBalance, alreadyCredited, paymentFound, details } = res;

        if (status === "success" || status === "completed") {
          const creditedAmount = amount || 0;
          const balanceToUse = typeof newBalance === 'number'
            ? newBalance
            : (alreadyCredited ? (user?.balance || 0) : (user?.balance || 0) + creditedAmount);
          const updatedUser: User = { ...user!, balance: balanceToUse };
          setUser(updatedUser);
          localStorage.setItem("currentUser", JSON.stringify(updatedUser));
          toast.success(`₦${creditedAmount.toFixed(2)} ${alreadyCredited ? 'verified' : 'added'}${paymentFound === false ? ' (record missing, credited virtually)' : ''}`);
          
          // Clean up
          localStorage.removeItem("latest_topup");
          const url = new URL(window.location.href);
          url.searchParams.delete("pref");
          window.history.replaceState({}, "", url.toString());
        } else if (status === "pending") {
          toast.info("Payment is still processing. Please wait a moment and refresh.");
        } else {
          toast.error(`Payment verification failed${details ? `: ${typeof details === 'string' ? details : JSON.stringify(details)}` : ''}. If amount was deducted, contact support.`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Verification failed";
        toast.error(`Verification error: ${msg}. Please try manual verify if payment succeeded.`);
      } finally {
        setIsVerifyingTopup(false);
      }
    })();
  }, [user, ercasRedirectProcessed, processedTransactions]);

  const handleSignOut = () => {
    localStorage.removeItem("currentUser");
    toast.info("Signed out successfully");
    navigate("/");
  };

  if (!user) return null;

  return (
    <>
      {isCreatingTopup && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-[85vw] w-[320px] text-center border-t-4 border-blue-500 transform scale-100 animate-in zoom-in-95 duration-200">
            <div className="mb-6 relative">
              <div className="absolute inset-0 bg-blue-100 dark:bg-blue-500/20 rounded-full animate-ping opacity-75"></div>
              <div className="relative bg-white dark:bg-slate-800 p-4 rounded-full shadow-md border border-slate-100 dark:border-slate-700">
                <Loader2 className="h-10 w-10 text-blue-600 dark:text-blue-400 animate-spin" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">ErcasPay Loading</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Connecting to secure checkout gateway...</p>
          </div>
        </div>
      )}
      
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] dark:from-slate-800 dark:via-[#020617] dark:to-black dark:text-white relative overflow-x-hidden md:overflow-hidden pb-28 md:pb-20 transition-colors duration-300">
      {/* Animated gradient orbs */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      <div className="absolute top-1/2 right-1/4 w-[400px] h-[400px] bg-gradient-to-br from-pink-400/15 to-blue-400/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.5s' }}></div>
      
      <Navbar 
        isShopPage 
        cartItemCount={purchaseHistory.length} 
        onCartClick={() => setShowPurchaseHistory(true)}
        shopCategories={shopCategoryMenuItems}
        activeShopCategory={activeCategory}
        onShopCategorySelect={handleCategoryNavigation}
        onShopCategoryMenuOpen={() => setShowCategorySheet(true)}
        onSignOut={handleSignOut}
      />

      <Dialog open={showPhonePrompt} onOpenChange={setShowPhonePrompt}>
        <DialogContent className="max-w-sm rounded-[1.75rem] border border-white/60 bg-white/95 p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950/95">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-blue-700 dark:text-blue-300">
              One-Time Identity Update
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              To automatically generate your dedicated Virtual Account, our payment provider requires an 11-digit phone number. This is a one-time update!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="prompt-phone" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Phone Number
              </label>
              <Input
                id="prompt-phone"
                type="tel"
                placeholder="08012345678"
                value={phonePromptValue}
                onChange={(e) => setPhonePromptValue(e.target.value.replace(/[^0-9]/g, '').slice(0, 11))}
                className="h-12 border-slate-200 focus:border-blue-600 focus:ring-blue-600/20 bg-slate-50"
              />
            </div>
            <Button
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
              onClick={() => {
                if (phonePromptValue.length !== 11) {
                  toast.error("Please enter a valid 11-digit phone number");
                  return;
                }
                setShowPhonePrompt(false);
                handleAddFunds(phonePromptValue);
              }}
              disabled={phonePromptValue.length !== 11 || isCreatingTopup}
            >
              {isCreatingTopup ? "Creating Account..." : "Create Virtual Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Display Virtual Account Details Dialog */}
      <Dialog open={showVADialog} onOpenChange={!isProcessingVA ? setShowVADialog : undefined}>
        <DialogContent className="max-w-sm rounded-[1.75rem] border border-white/60 bg-white/95 p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950/95 overflow-hidden">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-xl text-center font-bold text-blue-700 dark:text-blue-300">
              Your Funding Account
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col gap-1 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-500 tracking-wider uppercase">Bank</span>
              <span className="text-base font-bold text-slate-800 dark:text-slate-200">{vaDetails?.bankName || 'Palmpay'}</span>
            </div>
            
            <div className="flex flex-col gap-1 p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/30 relative">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 tracking-wider uppercase">Account Number</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-2xl font-bold tracking-widest text-slate-900 dark:text-white">
                  {vaDetails?.accountNumber}
                </span>
                <button 
                  onClick={() => {
                      if (vaDetails?.accountNumber) {
                          navigator.clipboard.writeText(vaDetails.accountNumber);
                          toast.success("Account Number copied to clipboard!");
                      }
                  }}
                  className="flex items-center justify-center p-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-95 transition-all"
                  title="Copy Account Number"
                >
                  <Copy className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="flex flex-col gap-1 p-4 mb-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-500 tracking-wider uppercase">Account Name</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200 break-words">{vaDetails?.accountName || 'Joy Buy Plaza'}</span>
            </div>
            
            <Button
              className="w-full h-14 rounded-xl bg-slate-900 hover:bg-black text-white text-lg font-bold shadow-lg transition-all dark:bg-slate-950"
              onClick={handleVADone}
              disabled={isProcessingVA}
            >
              {isProcessingVA ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                "Done"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCategorySheet} onOpenChange={setShowCategorySheet}>
        <DialogContent className="fixed inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-t-[2rem] rounded-b-none border-x-0 border-b-0 border-t border-white/60 bg-white/95 p-0 shadow-[0_-20px_60px_rgba(15,23,42,0.22)] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom dark:border-slate-800 dark:bg-slate-950/95 sm:max-w-none">
          <div className="mx-auto mt-3 h-1.5 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
          <DialogHeader className="px-5 pt-4 pb-2 text-left">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-blue-700 dark:text-blue-300">
              <Menu className="h-5 w-5" />
              Browse Categories
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
              Pick a category from the same list shown in the mobile navbar.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[72vh] space-y-2 overflow-y-auto px-4 pb-8 pt-2">
            <button
              type="button"
              onClick={() => handleCategoryNavigation("All")}
              className={`flex w-full items-center justify-between rounded-[1.4rem] border px-4 py-3.5 text-left transition-colors ${activeCategory === "All" ? "border-blue-200 bg-blue-50 shadow-sm dark:border-slate-700 dark:bg-slate-800" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}
            >
              <span>
                <span className="block text-sm font-semibold text-blue-700 dark:text-blue-300">All Categories</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Show everything in the shop</span>
              </span>
              <Badge className="bg-blue-600 text-white">{categoriesWithProducts.length}</Badge>
            </button>
            {shopCategoryMenuItems.map((category) => (
              <button
                key={category.name}
                type="button"
                onClick={() => handleCategoryNavigation(category.name)}
                className={`flex w-full items-center gap-3 rounded-[1.4rem] border px-3 py-3.5 text-left transition-colors ${activeCategory === category.name ? "border-blue-200 bg-blue-50 shadow-sm dark:border-slate-700 dark:bg-slate-800" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}
              >
                <img src={category.image} alt={category.name} className="h-14 w-14 rounded-2xl object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-blue-700 dark:text-blue-300">{category.name}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{category.productCount} item{category.productCount === 1 ? "" : "s"}</span>
                </span>
              </button>
            ))}
            
            {/* Added Sign Out Button in Mobile Navbar Sheet */}
            <div className="my-2 border-t border-slate-200 dark:border-slate-800"></div>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-[1.4rem] border border-red-200 bg-red-50 px-4 py-3.5 text-left transition-colors hover:bg-red-100 dark:border-red-900/30 dark:bg-red-950/20 dark:hover:bg-red-950/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400">
                <LogOut className="h-5 w-5" />
              </div>
              <span className="font-semibold text-red-600 dark:text-red-400">Sign Out</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDepositHistory} onOpenChange={setShowDepositHistory}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-[1.75rem] border border-white/60 bg-white/95 p-0 shadow-2xl dark:border-slate-800 dark:bg-slate-950/95">
          <DialogHeader className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-blue-700 dark:text-blue-300">
              <Banknote className="h-5 w-5" />
              Deposit History
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Completed deposits only.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
            {completedDeposits.length === 0 ? (
              <div className="py-10 text-center">
                <Banknote className="mx-auto h-14 w-14 text-slate-300 dark:text-slate-700" />
                <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">No completed deposits found.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {completedDeposits.map((deposit, index) => (
                  <div
                    key={deposit._id || `${deposit.reference || "deposit"}-${index}`}
                    className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-bold text-blue-700 dark:text-blue-300">₦{(deposit.amount || 0).toFixed(2)}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300">
                            {getDepositMethodLabel(deposit)}
                          </Badge>
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">
                            Complete
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      {new Date(deposit.createdAt).toLocaleString()}
                    </p>
                    {deposit.reference && (
                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Ref: {deposit.reference}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-slate-100 px-4 py-4 dark:border-slate-800">
            <Button
              type="button"
              onClick={() => setShowDepositHistory(false)}
              className="w-full rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purchase Summary Dialog */}
      <Dialog open={showPurchaseSummaryDialog} onOpenChange={setShowPurchaseSummaryDialog}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-green-600" />
              Purchase Successful
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>Your order has been completed. Below is your transaction summary and serial number(s).</p>
              <div className="rounded bg-blue-50 p-2 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                <strong>Format:</strong> for Account log format |Username| password| 2FA| email
              </div>
            </DialogDescription>
          </DialogHeader>
          {purchaseSummaryData && (
            <div className="space-y-4 text-slate-900 dark:text-slate-100">
              <div className="flex items-center gap-3">
                <img src={purchaseSummaryData.product?.image || (purchaseSummaryData.product?.id ? `${API_BASE}/api/catalog/${purchaseSummaryData.product.id}/image` : "")} alt={purchaseSummaryData.product?.name} className="h-16 w-16 rounded-lg border border-slate-200 object-contain dark:border-white/10" />
                <div>
                  <div className="text-lg font-bold">{purchaseSummaryData.product?.name}</div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">{purchaseSummaryData.product?.category}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="font-semibold text-gray-700 dark:text-slate-300">Wallet Before:</div>
                <div className="text-gray-800 dark:text-slate-100">₦{purchaseSummaryData.balanceBefore.toFixed(2)}</div>
                <div className="font-semibold text-gray-700 dark:text-slate-300">Wallet After:</div>
                <div className="text-gray-800 dark:text-slate-100">₦{purchaseSummaryData.balanceAfter.toFixed(2)}</div>
                <div className="font-semibold text-gray-700 dark:text-slate-300">Quantity:</div>
                <div className="text-gray-800 dark:text-slate-100">{purchaseSummaryData.quantity}</div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-gray-700 dark:text-slate-300">Serial Number{purchaseSummaryData.serials.length > 1 ? 's' : ''}:</div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => {
                        const allSerials = purchaseSummaryData.serials.join('\n');
                        const blob = new Blob([allSerials], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        // Replace spaces and special chars, fallback to "purchased-items" if name is missing
                        const safeName = (purchaseSummaryData.product?.name || 'purchased-items').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        a.download = `${safeName}-logs.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success('File downloaded!');
                      }}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download {purchaseSummaryData.serials.length > 1 ? 'All' : 'Log'}
                    </Button>
                    {purchaseSummaryData.serials.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => {
                          const allSerials = purchaseSummaryData.serials.join('\n');
                          navigator.clipboard.writeText(allSerials);
                          toast.success(`${purchaseSummaryData.serials.length} logs copied!`);
                        }}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy All
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {purchaseSummaryData.serials.map((serial, idx) => (
                    <div key={serial} className="flex items-start gap-2 rounded border border-slate-200 bg-gray-100 px-2 py-1 dark:border-white/10 dark:bg-slate-950/85">
                      <span className="min-w-0 flex-1 break-all font-mono text-sm text-blue-700 dark:text-blue-300">{serial}</span>
                      <button
                        type="button"
                        className="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                        onClick={() => {
                          navigator.clipboard.writeText(serial);
                          toast.success('Serial copied!');
                        }}
                        aria-label="Copy serial"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurchaseSummaryDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Add Funds Dialog (mobile) */}
      <Dialog open={showManualAddFundsDialog} onOpenChange={setShowManualAddFundsDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Manual Add Funds</DialogTitle>
            <DialogDescription>
              Use the details below to make a manual bank transfer. Add the description so we can identify your payment.
            </DialogDescription>
            <p className="text-sm text-red-600 font-medium mt-2">Click 'Done' after payment</p>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
              <p className="text-sm font-semibold">Bank: <span className="font-normal">Moniepoint MFB</span></p>
              <p className="text-sm font-semibold">Account no.: <span className="font-normal">7026057454</span></p>
              <p className="text-sm font-semibold">Account name: <span className="font-normal">Clinton Kenechukwu</span></p>
              <p className="text-sm font-semibold">Description: <span className="font-normal">Bills</span></p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const details = `Bank: Moniepoint MFB\nAccount no.: 7026057454\nAccount name: Clinton Kenechukwu\nDescription: Bills`;
                  navigator.clipboard.writeText(details);
                  toast.success('Account details copied');
                }}
                className="flex-1"
              >
                Copy Details
              </Button>
              <Button
                onClick={() => {
                  setShowManualAddFundsDialog(false);
                  window.open("https://wa.me/2347026057454", "_blank");
                }}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white"
              >
                Done
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowManualAddFundsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile Fintech-style Add Funds Flow */}
      <Dialog open={showAddFundsFlow} onOpenChange={setShowAddFundsFlow}>
        <DialogContent className="fixed inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 p-0 overflow-hidden flex flex-col h-[85vh] sm:h-auto rounded-t-[2rem] rounded-b-none border-x-0 border-b-0 border-t border-white/60 bg-white dark:bg-slate-950 shadow-[0_-20px_60px_rgba(15,23,42,0.22)] data-[state=closed]:slide-out-to-bottom-[100%] data-[state=open]:slide-in-from-bottom-[100%] sm:max-w-md sm:mx-auto sm:top-[50%] sm:bottom-auto sm:-translate-y-1/2 sm:rounded-[2rem]">
          <div className="mx-auto mt-3 h-1.5 w-16 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0 sm:hidden" />
          <div className="flex-1 overflow-y-auto w-full pt-3 pb-8 px-5 lg:px-6 custom-scrollbar">
            
            <div className="flex items-center justify-between mb-8 relative">
              <button 
                onClick={() => setShowAddFundsFlow(false)}
                className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white absolute left-1/2 -translate-x-1/2">
                Fund wallet
              </h2>
            </div>

            {addFundsStep === "amount" ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="space-y-4 pt-4">
                  <p className="text-[11px] font-bold text-center text-slate-400 uppercase tracking-[0.2em]">Enter Amount</p>
                  <div className="relative group mx-auto max-w-[280px]">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-900 dark:text-white font-extrabold text-3xl z-10 transition-colors">
                      <span>₦</span>
                    </div>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={addFundsAmount}
                      onChange={(e) => setAddFundsAmount(e.target.value)}
                      min="0"
                      step="0.01"
                      className="h-20 pl-14 pr-4 rounded-2xl border-2 border-transparent bg-slate-50 dark:bg-slate-900 focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 text-4xl font-extrabold text-center text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 shadow-inner"
                    />
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2 pt-4">
                    {[1000, 2000, 5000, 10000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setAddFundsAmount(amt.toString())}
                        className="h-12 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 active:scale-95 transition-all shadow-sm"
                      >
                        {amt >= 1000 ? `${amt/1000}k` : amt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <Button 
                    className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg shadow-[0_8px_20px_-8px_rgba(37,99,235,0.6)] active:scale-[0.98] transition-all"
                    disabled={!addFundsAmount || parseFloat(addFundsAmount) <= 0}
                    onClick={() => setAddFundsStep("method")}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 pt-2 animate-in fade-in slide-in-from-right-8 duration-300">
                <div className="text-center space-y-2 pb-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">Amount to fund</p>
                  <p className="text-[2.5rem] font-extrabold text-slate-900 dark:text-white tracking-tight">
                    <span className="text-blue-600 dark:text-blue-500">₦</span>
                    {parseFloat(addFundsAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </p>
                </div>
                
                <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] text-center mb-3">Select Payment Method</p>
                  
                  <button 
                    onClick={() => { setShowAddFundsFlow(false); handleAddFunds(); }}
                    className="flex items-center justify-between w-full p-4 rounded-2xl bg-white dark:bg-slate-950 border-2 border-blue-500 text-left shadow-md hover:shadow-lg active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                        <Plus className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white text-[15px]">Instant payment</p>
                        <p className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wider mt-0.5">ErcasPay</p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-blue-500" />
                  </button>

                  <button 
                    onClick={() => { setShowAddFundsFlow(false); setShowManualAddFundsDialog(true); }}
                    className="flex items-center justify-between w-full p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-left shadow-sm hover:border-slate-300 dark:hover:border-slate-700 active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-600 dark:text-slate-400 shrink-0">
                        <Banknote className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white text-[15px]">Bank transfer</p>
                        <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">Manual Verification</p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  </button>
                  
                  <button 
                    onClick={() => setAddFundsStep("amount")} 
                    className="w-full text-center mt-6 text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition-colors py-2"
                  >
                     Change amount
                  </button>
                </div>
              </div>
            )}
            
            {/* Common block: History */}
            <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-slate-400" />
                  <h3 className="font-bold text-[13px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">Recent Transactions</h3>
                </div>
              </div>
              
              <div className="space-y-3">
                {depositHistory.slice(0, 3).map((deposit, index) => {
                  const isSuccess = (deposit.status || "").toLowerCase() === "completed" || (deposit.status || "").toLowerCase() === "success" || (deposit.status || "").toLowerCase() === "successful";
                  return (
                    <div
                      key={deposit._id || `mobile-dep-${index}`}
                      className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40"
                    >
                      <div>
                        <p className="text-[15px] font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                          ₦{(deposit.amount || 0).toLocaleString()}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500 font-medium">
                          {new Date(deposit.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} • {getDepositMethodLabel({ method: deposit.method, reference: deposit.reference })}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider ${isSuccess ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/50' : 'text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-950/50'}`}>
                        {isSuccess ? 'Success' : deposit.status || "Pending"}
                      </span>
                    </div>
                  );
                })}
                
                {depositHistory.length === 0 && (
                  <div className="py-8 text-center flex flex-col items-center justify-center">
                    <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center mb-3">
                      <Banknote className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                    </div>
                    <p className="text-sm font-semibold text-slate-500">No recent transactions</p>
                  </div>
                )}
                
                {depositHistory.length > 3 && (
                  <button 
                    onClick={() => { setShowAddFundsFlow(false); setShowDepositHistory(true); }}
                    className="w-full text-center text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 pt-3 flex items-center justify-center gap-1 mx-auto"
                  >
                    View All History <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

          </div>
        </DialogContent>
      </Dialog>

      <div className="pt-24 relative z-10">
        {/* Banner Section with Welcome Badge - Full Width */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="relative mb-6"
        >
          {/* <a 
            href="https://chat.whatsapp.com/Jyr22tl4NNA6GJ5dXIpAlv?mode=wwt" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block relative overflow-hidden rounded-none md:rounded-2xl shadow-xl border-y-2 md:border-2 border-white/60 dark:border-gray-800 hover:border-blue-400 transition-colors w-screen left-1/2 -ml-[48vw] pr-2 md:w-full md:left-auto md:ml-0 md:pr-0"
          > */}
          {/* <div className="block relative overflow-hidden rounded-none md:rounded-2xl shadow-xl border-y-2 md:border-2 border-white/60 dark:border-gray-800 hover:border-blue-400 transition-colors w-screen left-1/2 -ml-[48vw] pr-2 md:w-full md:left-auto md:ml-0 md:pr-0">
            <img
              src={bannerImg}
              alt="Premium products banner"
              className="w-full h-7 md:h-44 object-cover select-none"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 via-purple-900/20 to-pink-900/20 mix-blend-multiply"></div>
          </div> */}
          {/* </a> */}
          
          {/* Title moved below banner */}
          <h1 className="mt-6 text-center text-3xl md:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 tracking-tight">
            Shop Premium Products
          </h1>
          <div className="mt-4 flex justify-center">
            <a
              href="https://www.smslegit.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors shadow-md"
            >
              Click here to get ur sms number
            </a>
          </div>
        </motion.div>

        <div className="px-3 md:px-6">
          <div className="w-full md:container md:mx-auto">
            
            {/* Header Section (subtitle only now, main title moved into banner) */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6 }}
              className="text-center mb-6 md:mb-12"
            >
              <p className="text-sm md:text-xl text-gray-700 dark:text-gray-300 max-w-3xl mx-auto">Discover our curated collection of high-quality social media accounts</p>
            </motion.div>

            {/* Wallet Section */}
            <div ref={walletSectionRef}>
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6 }}
              >
                <div className="mb-8 md:mb-12 relative overflow-hidden rounded-3xl md:rounded-[2rem] bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-700 shadow-[0_20px_50px_-15px_rgba(37,99,235,0.4)]">
                  {/* Subtle inner background wrapper */}
                  <div className="relative h-full w-full rounded-3xl md:rounded-[2rem] px-4 py-5 md:px-10 md:py-10 flex flex-col lg:flex-row items-center justify-between gap-5 lg:gap-12">
                    
                    {/* Background decorations */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/5 rounded-full blur-2xl pointer-events-none translate-y-1/2 -translate-x-1/2"></div>

                    {/* Left: Wallet Info */}
                    <div className="flex w-full lg:w-auto flex-col relative z-10">
                      
                      {/* Top: User Welcome */}
                      <div className="flex items-center gap-2 md:gap-3 mb-4 md:mb-8 bg-white/10 dark:bg-black/10 backdrop-blur-md rounded-2xl p-1.5 pr-4 md:p-2 md:pr-6 w-fit border border-white/20 shadow-sm">
                        <div className="flex h-8 w-8 md:h-12 md:w-12 items-center justify-center rounded-xl bg-white text-blue-600 font-extrabold text-sm md:text-xl shadow-inner shrink-0">
                          {(user.name || user.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1 md:gap-1.5">
                            <span className="font-bold text-white text-sm md:text-base truncate max-w-[100px] md:max-w-[200px]">
                              {user.name || user.email.split('@')[0]}
                            </span>
                            <BadgeCheck className="h-[14px] w-[14px] md:h-[18px] md:w-[18px] text-[#4ade80]" />
                          </div>
                          <span className="text-[9px] md:text-[11px] font-semibold text-blue-100/90 uppercase tracking-wider">welcome back</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between w-full lg:justify-start gap-4">
                        <div className="flex items-center gap-3 md:gap-4">
                          <div className="flex h-11 w-11 md:h-14 md:w-14 items-center justify-center rounded-[14px] md:rounded-2xl bg-white/15 text-white shrink-0 backdrop-blur-md border border-white/20">
                            <Wallet className="h-5 w-5 md:h-7 md:w-7" />
                          </div>
                          <div>
                            <h2 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-blue-100/70">Your Wallet</h2>
                            <div className="flex items-baseline gap-1 mt-0.5 md:mt-1">
                              <span className="text-xs md:text-sm font-medium text-blue-100 mr-1">Balance:</span>
                              <span className="text-3xl md:text-5xl font-extrabold tracking-tight text-white drop-shadow-sm">
                                ₦{Math.max(0, user.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Deposit History Button */}
                        <button
                          className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0 backdrop-blur-md border border-white/20 ml-1 md:ml-2"
                          title="View deposit history"
                          onClick={() => setShowDepositHistory(true)}
                        >
                          <Banknote className="h-5 w-5 md:h-6 md:w-6" />
                        </button>
                      </div>
                    </div>

                    {/* Divider for Desktop */}
                    <div className="hidden lg:block h-32 w-px bg-white/20 absolute left-[50%] top-1/2 -translate-y-1/2 pointer-events-none" />

                    {/* Right: Actions */}
                    <div className="w-full lg:w-[45%] flex flex-col gap-3 md:gap-4 relative z-10">
                      
                      {/* Desktop Actions */}
                      <div className="hidden md:flex flex-row w-full gap-3">
                        <div className="relative flex-1 group">
                          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-blue-600 font-bold text-lg z-10 transition-colors">
                            <span>₦</span>
                          </div>
                          <Input
                            ref={walletInputRef}
                            type="number"
                            placeholder="Enter amount"
                            value={addFundsAmount}
                            onChange={(e) => setAddFundsAmount(e.target.value)}
                            min="0"
                            step="0.01"
                            className="h-14 pl-10 pr-4 rounded-xl border-white/30 bg-white/95 focus:bg-white focus:ring-4 focus:ring-white/30 focus:border-white text-lg transition-all font-bold text-slate-800 placeholder:font-medium placeholder:text-slate-400 shadow-inner"
                          />
                        </div>
                        <Button 
                          onClick={handleAddFunds}
                          className="h-14 px-8 rounded-xl bg-slate-900 hover:bg-black text-white text-base font-bold tracking-wide shadow-xl transition-all active:scale-95 dark:bg-slate-950"
                        >
                          <Plus className="mr-2 h-5 w-5" />
                          Add Funds
                        </Button>
                      </div>

                      {/* Mobile Actions */}
                      <div className="flex md:hidden flex-col w-full gap-2">
                        <Button 
                          onClick={() => { setAddFundsStep("amount"); setShowAddFundsFlow(true); }}
                          className="h-10 px-4 rounded-[0.8rem] bg-slate-900 hover:bg-black text-white text-xs font-bold tracking-wide shadow-xl transition-all active:scale-95 w-full dark:bg-slate-950"
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          Add Funds
                        </Button>
                      </div>

                      <div className="flex items-center justify-between mt-1 pt-2 md:pt-3 border-t border-white/20">
                          {/* <p className="text-xs text-blue-100/90 font-medium hidden md:block">
                            Instant tops with ErcasPay & card
                          </p>
                          <p className="text-[10px] text-blue-100/90 font-medium md:hidden text-center w-full">
                            Deposit securely using Ercaspay or Bank Transfer
                          </p> */}

                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Products Section - Full Width on Mobile */}
        <div className="px-0 md:px-6">
          <div className="w-full md:container md:mx-auto">
            {/* Products and Buy Dialog */}
            <div className="grid lg:grid-cols-1 gap-8">
              {/* Products Grid */}
              <div className="lg:col-span-1">
                <motion.h2 
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.5 }}
                  className="text-2xl md:text-4xl lg:text-5xl font-bold mb-6 md:mb-8 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 px-3 md:px-0"
                  style={{ fontFamily: 'Poppins, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}
                >
                  Our Products
                </motion.h2>
                {/* Category Filters */}
                {/* 
                <motion.div 
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="flex flex-wrap gap-2 md:gap-3 mb-6 md:mb-8 -ml-8 w-[calc(100%+4rem)] px-4 md:px-0 md:ml-0 md:w-full box-border"
                >
                  {categories.map(cat => (
                    <Button
                      key={cat}
                      variant={activeCategory === cat ? "default" : "outline"}
                      onClick={() => {
                        setActiveCategory(cat);
                        scrollToCategory(cat);
                      }}
                      className={`rounded-full px-3 md:px-5 py-1.5 md:py-2 text-xs md:text-sm font-semibold transition-all duration-300 shadow ${activeCategory === cat ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700' : 'bg-white/70 backdrop-blur border-2 border-white/60 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 dark:bg-white/5 dark:border-white/10 dark:hover:from-white/10 dark:hover:to-white/10 dark:text-gray-300'}`}
                    >
                      {cat}
                    </Button>
                  ))}
                </motion.div>
                */}

                {/* Display products grouped by category */}
                {activeCategory === "All" ? (
                  <div className="space-y-8 md:space-y-12">{categoriesWithProducts.map((category, index) => renderCategoryBlock(category, index))}</div>
                ) : (
                  renderCategoryBlock(activeCategory)
                )}
              </div>
            </div>
            
            {/* Live Activity Section */}
            {liveActivities.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6 }}
                className="mt-12 md:mt-16 lg:col-span-1 border-t border-slate-200 dark:border-slate-800 pt-8 md:pt-10 pb-4"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </div>
                  <h2 className="text-xl md:text-2xl lg:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-700 to-slate-900 dark:from-slate-200 dark:to-white font-['Poppins']">
                    RECENT ACTIVITY
                  </h2>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-black/20 backdrop-blur-md overflow-hidden shadow-sm">
                  <div className="grid grid-cols-[1.5fr_1fr_1fr] md:grid-cols-[1fr_2fr_1fr_1fr] bg-slate-50 dark:bg-white/5 px-3 md:px-6 py-3 text-[10px] md:text-sm font-semibold text-slate-500 dark:text-slate-300 tracking-wider">
                    <div className="hidden md:block">USER</div>
                    <div>ACTIVITY</div>
                    <div className="text-center">AMOUNT</div>
                    <div className="text-right">TIME</div>
                  </div>
                  
                  <div className="flex flex-col relative overflow-hidden">
                    <AnimatePresence initial={false}>
                      {liveActivities.map((activity) => (
                        <motion.div
                          key={activity.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ type: "spring", bounce: 0.3, duration: 0.7 }}
                        >
                            <div className="grid grid-cols-[1.5fr_1fr_1fr] md:grid-cols-[1fr_2fr_1fr_1fr] items-center gap-1 md:gap-2 px-3 md:px-6 py-3 border-t border-slate-100 dark:border-white/5 text-xs md:text-sm bg-white dark:bg-transparent">
                              <div className="hidden md:flex font-medium text-slate-900 dark:text-slate-200 truncate">
                                {activity.user}
                              </div>
                              <div className="flex flex-col md:flex-row md:items-center md:gap-2 align-middle">
                                <span className="md:hidden font-medium text-slate-900 dark:text-slate-200">{activity.user}</span>
                                <span className="text-slate-600 dark:text-slate-300 line-clamp-1 break-all">
                                  {activity.action === "buy" ? (
                                    <>
                                      bought <span className="font-semibold text-blue-600 dark:text-blue-400">{activity.detail}</span>
                                      {activity.description && <span className="text-slate-400 dark:text-slate-500 hidden lg:inline"> - {activity.description}</span>}
                                    </>
                                  ) : (
                                    <>deposited via <span className="font-semibold text-purple-600 dark:text-purple-400">{activity.detail}</span></>
                                  )}
                                </span>
                              </div>
                              <div className="text-center font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                ₦{activity.amount.toLocaleString()}
                              </div>
                              <div className="text-right text-slate-500 dark:text-slate-400 whitespace-nowrap text-[10px] md:text-[11px] lg:text-xs font-medium">
                                {activity.timeString}
                              </div>
                            </div>
                          </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Buy Confirmation Dialog */}
      <Dialog open={showBuyDialog} onOpenChange={setShowBuyDialog}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-2 border-white/60 dark:border-gray-800 p-3 md:p-4">
          <DialogHeader className="pb-1 md:pb-2">
            <DialogTitle className="text-lg md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
              Confirm Purchase
            </DialogTitle>
            <DialogDescription className="text-xs md:text-sm text-gray-600 dark:text-gray-400">
              Review the product details below before completing your purchase.
            </DialogDescription>
          </DialogHeader>
          
          {selectedProduct && (
            <div className="space-y-2 md:space-y-3 py-1 md:py-2">
              {/* Product Image */}
              <div className="flex justify-center">
                <div className="relative overflow-hidden rounded-xl shadow-md">
                  <img
                    src={selectedProduct.image || `${API_BASE}/api/catalog/${selectedProduct.id}/image`}
                    alt={selectedProduct.name}
                    className="w-20 h-20 md:w-28 md:h-28 object-cover rounded-xl"
                  />
                </div>
              </div>
              
              {/* Product Details */}
              <div className="space-y-2 md:space-y-2">
                <div>
                  <h3 className="text-base md:text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                    {selectedProduct.name}
                  </h3>
                  <Badge variant="outline" className="text-xs bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-950 dark:to-purple-950 text-blue-700 dark:text-blue-400 border-none">
                    {selectedProduct.category}
                  </Badge>
                </div>
                
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {selectedProduct.description}
                </p>
                
                <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-gray-800">
                  <span className="text-sm md:text-lg font-semibold text-gray-700 dark:text-gray-300">Unit Price:</span>
                  <Badge className="text-sm md:text-lg px-3 md:px-4 py-1 md:py-2 bg-gradient-to-r from-blue-500 to-blue-400 font-bold">
                    ₦{selectedProduct.price}
                  </Badge>
                </div>

                {/* Quantity Selector */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm md:text-lg font-semibold text-gray-700 dark:text-gray-300">Quantity:</span>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setPurchaseQuantity(Math.max(1, purchaseQuantity - 1))}
                      disabled={purchaseQuantity <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-lg font-bold min-w-[2rem] text-center">{purchaseQuantity}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        const maxStock = selectedProduct.serialNumbers ? selectedProduct.serialNumbers.filter(s => !s.isUsed).length : (selectedProduct.stockCount || 0);
                        setPurchaseQuantity(Math.min(maxStock, purchaseQuantity + 1));
                      }}
                      disabled={purchaseQuantity >= (selectedProduct.serialNumbers ? selectedProduct.serialNumbers.filter(s => !s.isUsed).length : (selectedProduct.stockCount || 0))}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
                  {selectedProduct.serialNumbers ? selectedProduct.serialNumbers.filter(s => !s.isUsed).length : (selectedProduct.stockCount || 0)} units available
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-gray-800">
                  <span className="text-sm md:text-lg font-semibold text-gray-700 dark:text-gray-300">Total:</span>
                  <Badge className="text-sm md:text-lg px-3 md:px-4 py-1 md:py-2 bg-gradient-to-r from-purple-500 to-pink-500 font-bold">
                    ₦{(selectedProduct.price * purchaseQuantity).toFixed(2)}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs md:text-sm font-medium text-gray-600 dark:text-gray-400">Your Balance:</span>
                  <span className="text-xs md:text-sm font-bold text-blue-600 dark:text-blue-400">
                    ₦{Math.max(0, user?.balance || 0).toFixed(2)}
                  </span>
                </div>
              </div>
              
              {/* Confirmation Message */}
              <div className="bg-blue-50 dark:bg-blue-950/30 p-2 md:p-3 rounded-lg border border-blue-200 dark:border-blue-900">
                <p className="text-center text-xs md:text-sm font-medium text-blue-900 dark:text-blue-300">
                  Do you want to pay for {purchaseQuantity} {purchaseQuantity === 1 ? 'item' : 'items'}?
                </p>
              </div>
            </div>
          )}
          
          <DialogFooter className="flex flex-row gap-2 md:gap-3 pt-2 md:pt-3 sticky bottom-0 bg-white/95 dark:bg-gray-900/95 -mx-3 md:-mx-4 px-3 md:px-4 pb-0">
            <Button
              variant="outline"
              onClick={handleCancelPurchase}
              className="flex-1 h-10 md:h-11 text-sm md:text-base border-2 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 font-semibold"
            >
              <X className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleConfirmPurchase}
              disabled={isPurchasing || Math.max(0, user?.balance || 0) < (selectedProduct?.price || 0) * purchaseQuantity}
              className="flex-1 h-10 md:h-11 text-sm md:text-base bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPurchasing ? (
                <>
                  <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <span className="mr-1 md:mr-2">₦</span>
                  {Math.max(0, user?.balance || 0) >= (selectedProduct?.price || 0) * purchaseQuantity ? "Continue" : "Insufficient Balance"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purchase History Dialog */}
      <Dialog open={showPurchaseHistory} onOpenChange={setShowPurchaseHistory}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-2 border-white/60 dark:border-gray-800 p-4 md:p-6">
          <DialogHeader className="pb-3 md:pb-4">
            <DialogTitle className="text-lg md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 md:h-6 md:w-6" />
              Purchase History
            </DialogTitle>
            <DialogDescription className="text-xs md:text-sm text-gray-600 dark:text-gray-400">
              View all your purchased items
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-2">
            {purchaseHistory.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingCart className="h-16 w-16 mx-auto text-gray-300 dark:text-gray-700 mb-4" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No purchases yet</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Your purchased items will appear here</p>
              </div>
            ) : (
              purchaseHistory.map((item, index) => (
                <Card key={index} className="bg-white/80 dark:bg-black/20 border border-gray-200 dark:border-white/5 backdrop-blur-md">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      {/* Product Image */}
                      <div className="relative overflow-hidden rounded-lg flex-shrink-0">
                        <img
                          src={item.image || (item.productId ? `${API_BASE}/api/catalog/${item.productId}/image` : "")}
                          alt={item.name}
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                      </div>
                      
                      {/* Product Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 mb-1">
                          <div className="min-w-0 flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full">
                            <h4 className="font-semibold text-xs md:text-sm text-gray-900 dark:text-gray-100 line-clamp-2 flex-1 min-w-0">
                              {item.name}
                            </h4>
                            {item.quantity > 1 && (
                              <Badge className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 whitespace-nowrap flex-shrink-0">
                                x{item.quantity}
                              </Badge>
                            )}
                          </div>
                          <Badge className="text-xs px-2 py-0.5 bg-gradient-to-r from-blue-500 to-blue-400 font-bold whitespace-nowrap flex-shrink-0 mt-1 md:mt-0">
                            ₦{(item.price * item.quantity).toFixed(2)}
                          </Badge>
                        </div>
                        <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-950 dark:to-purple-950 text-blue-700 dark:text-blue-400 border-none mb-1">
                          {item.category}
                        </Badge>
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-1">
                          {item.description}
                        </p>
                        
                        {/* Serial Numbers */}
                        {item.assignedSerials && item.assignedSerials.length > 0 && (
                          <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                            <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-1">
                              Logs:
                            </p>
                            <div className="space-y-1">
                              {item.assignedSerials.map((serial, idx) => (
                                <div key={idx} className="flex items-start gap-2">
                                  <Badge className="text-xs font-mono bg-blue-600 hover:bg-blue-700 px-2 py-0.5 flex-1 min-w-0 break-all whitespace-normal text-left">
                                    {serial}
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 hover:bg-blue-100 dark:hover:bg-blue-900"
                                    onClick={() => {
                                      navigator.clipboard.writeText(serial);
                                      toast.success('Serial number copied!');
                                    }}
                                  >
                                    <Copy className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                  </Button>
                                  {item.assignedSerials!.length > 1 && (
                                    <span className="text-[10px] text-gray-500">Unit {idx + 1}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          Purchased: {new Date(item.purchaseDate).toLocaleDateString()} at {new Date(item.purchaseDate).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          
          <DialogFooter className="pt-3 md:pt-4 sticky bottom-0 bg-white/95 dark:bg-gray-900/95 -mx-4 md:-mx-6 px-4 md:px-6 pb-0">
            <Button
              onClick={() => setShowPurchaseHistory(false)}
              className="w-full h-10 md:h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Social Support Icons */}
      {/* <div className="fixed bottom-24 left-6 z-50 md:bottom-8">
        <a
          href="https://chat.whatsapp.com/Jyr22tl4NNA6GJ5dXIpAlv?mode=wwt"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-2xl hover:scale-110 transition-all duration-300"
          aria-label="Contact us on WhatsApp"
        >
          <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>
      </div> */}

      <div className="fixed bottom-24 right-6 z-50 md:bottom-8">
        <a
          href="https://t.me/LEGITSUPPORT2"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-1 group"
          aria-label="Contact us on Telegram"
        >
          <div className="flex items-center justify-center w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-2xl group-hover:scale-110 transition-all duration-300">
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
          </div>
        </a>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
        <div className="grid grid-cols-4 rounded-none border-x-0 border-b-0 border-t border-white/70 bg-white/92 px-3 py-1.5 shadow-[0_-10px_28px_rgba(15,23,42,0.14)] backdrop-blur-2xl dark:border-white/10 dark:bg-black/88">
          <button
            type="button"
            onClick={handleMobileFundClick}
            className={getMobileNavClasses("fund").button}
          >
            <span className={getMobileNavClasses("fund").icon}>
              <WalletIcon className="h-[18px] w-[18px]" />
            </span>
            <span className={getMobileNavClasses("fund").label}>Fund</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMobileSection("category");
              setShowCategorySheet(true);
            }}
            className={getMobileNavClasses("category").button}
          >
            <span className={getMobileNavClasses("category").icon}>
              <Menu className="h-[18px] w-[18px]" />
            </span>
            <span className={getMobileNavClasses("category").label}>Category</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMobileSection("order");
              setShowPurchaseHistory(true);
            }}
            className={getMobileNavClasses("order").button}
          >
            <span className={getMobileNavClasses("order").icon}>
              <History className="h-[18px] w-[18px]" />
              {purchaseHistory.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white">
                  {purchaseHistory.length}
                </span>
              )}
            </span>
            <span className={getMobileNavClasses("order").label}>Order</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMobileSection("deposit");
              setShowDepositHistory(true);
            }}
            className={getMobileNavClasses("deposit").button}
          >
            <span className={getMobileNavClasses("deposit").icon}>
              <Banknote className="h-[18px] w-[18px]" />
            </span>
            <span className={getMobileNavClasses("deposit").label}>Deposit</span>
          </button>
        </div>
      </div>
    </div>
    </>
  );
};

export default Shop;




