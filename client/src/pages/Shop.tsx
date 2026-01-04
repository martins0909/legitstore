import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { apiFetch, catalogAPI, purchaseHistoryAPI, catalogCategoriesAPI } from "@/lib/api";
import { Banknote, ChevronDown, History, Copy } from "lucide-react";
import bannerImg from "@/assets/banner.jpg";
import { Plus, Wallet, LogOut, BadgeCheck, X, ShoppingCart, Minus } from "lucide-react";
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
}

interface PurchaseHistoryItem extends Product {
  purchaseDate: string;
  quantity: number;
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

const initialProducts: Product[] = [];

const Shop = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
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
  useEffect(() => {
    if (!user) return;

    const refreshBalance = async () => {
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
    const availableSerials = (selectedProduct.serialNumbers || []).filter(s => !s.isUsed);
    if (availableSerials.length < purchaseQuantity) {
      toast.error(`Only ${availableSerials.length} units available in stock.`);
      return;
    }

    try {
      // Assign serial numbers to this purchase
      const serialsToAssign = availableSerials.slice(0, purchaseQuantity);
      const assignedSerialNumbers = serialsToAssign.map(s => s.serial);

      // Update product serials to mark as used
      const updatedSerials = (selectedProduct.serialNumbers || []).map(s => {
        if (serialsToAssign.some(assigned => assigned.id === s.id)) {
          return {
            ...s,
            isUsed: true,
            usedBy: user.email,
            usedAt: new Date().toISOString()
          };
        }
        return s;
      });

      // Complete purchase via backend (deducts balance, updates product, creates history)
      // Backend handles both MongoDB _id and custom UUID id fields, so always send serialUpdates
      const result = await purchaseHistoryAPI.completePurchase({
        userId: user.id,
        productId: selectedProduct.id,
        quantity: purchaseQuantity,
        serialUpdates: updatedSerials,
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
          assignedSerials: assignedSerialNumbers
        }
      });

      // Update local state with new balance from backend
      const updatedUser: User = { ...user, balance: result.newBalance };
      setUser(updatedUser);
      localStorage.setItem("currentUser", JSON.stringify(updatedUser));
      
      const usersRaw = JSON.parse(localStorage.getItem("users") || "[]") as User[];
      const updatedUsers = usersRaw.map(u => u.id === user.id ? updatedUser : u);
      localStorage.setItem("users", JSON.stringify(updatedUsers));

      // Update local products state using backend authoritative serialNumbers if provided
      const backendSerials = result.updatedProduct?.serialNumbers;
      const updatedProducts = products.map(p => {
        if (p.id === selectedProduct.id) {
          return {
            ...p,
            serialNumbers: backendSerials && backendSerials.length > 0 ? backendSerials : updatedSerials
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

  // Group products by category
  const groupedProducts = products.reduce((acc, product) => {
    if (!acc[product.category]) {
      acc[product.category] = [];
    }
    acc[product.category].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  // Get categories that have products (excluding "All")
  const categoriesWithProducts = categories.filter(cat => cat !== "All" && groupedProducts[cat]?.length > 0);

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

  const handleAddFunds = async () => {
    const amount = parseFloat(addFundsAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

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
          // Include amount in callback so we can recover if localStorage missing
          callbackUrl: `${window.location.origin}/shop?ercasAmount=${amount}`,
        }),
      });

      const { checkoutUrl, paymentReference, transactionReference } = res as {
        checkoutUrl: string;
        paymentReference: string;
        transactionReference: string | null;
      };

      // Store reference for later verification
      localStorage.setItem("latest_topup", JSON.stringify({
        paymentReference,
        transactionReference: transactionReference || null,
        amount,
        createdAt: Date.now(),
      }));

      // Immediately redirect to payment page (same tab)
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        toast.error("Failed to get payment URL");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start payment";
      toast.error(msg);
      setIsCreatingTopup(false);
    }
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 relative overflow-hidden pb-20 transition-colors duration-300">
      {/* Animated gradient orbs */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      <div className="absolute top-1/2 right-1/4 w-[400px] h-[400px] bg-gradient-to-br from-pink-400/15 to-blue-400/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '0.5s' }}></div>
      
      <Navbar 
        isShopPage 
        cartItemCount={purchaseHistory.length} 
        onCartClick={() => setShowPurchaseHistory(true)}
      />

      {/* Purchase Summary Dialog */}
      <Dialog open={showPurchaseSummaryDialog} onOpenChange={setShowPurchaseSummaryDialog}>
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-green-600" />
              Purchase Successful
            </DialogTitle>
            <DialogDescription>
              Your order has been completed. Below is your transaction summary and serial number(s).
            </DialogDescription>
          </DialogHeader>
          {purchaseSummaryData && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <img src={purchaseSummaryData.product?.image} alt={purchaseSummaryData.product?.name} className="w-16 h-16 rounded-lg object-contain border" />
                <div>
                  <div className="font-bold text-lg">{purchaseSummaryData.product?.name}</div>
                  <div className="text-sm text-gray-500">{purchaseSummaryData.product?.category}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="font-semibold text-gray-700">Wallet Before:</div>
                <div className="text-gray-800">₦{purchaseSummaryData.balanceBefore.toFixed(2)}</div>
                <div className="font-semibold text-gray-700">Wallet After:</div>
                <div className="text-gray-800">₦{purchaseSummaryData.balanceAfter.toFixed(2)}</div>
                <div className="font-semibold text-gray-700">Quantity:</div>
                <div className="text-gray-800">{purchaseSummaryData.quantity}</div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-gray-700">Serial Number{purchaseSummaryData.serials.length > 1 ? 's' : ''}:</div>
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
                      Copy All Logs
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {purchaseSummaryData.serials.map((serial, idx) => (
                    <div key={serial} className="flex items-start gap-2 bg-gray-100 rounded px-2 py-1">
                      <span className="font-mono text-sm text-blue-700 break-all flex-1 min-w-0">{serial}</span>
                      <button
                        type="button"
                        className="ml-2 text-blue-600 hover:text-blue-800"
                        onClick={() => {
                          navigator.clipboard.writeText(serial);
                          toast.success('Serial copied!');
                        }}
                        aria-label="Copy serial"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16h8M8 12h8m-8-4h8M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
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
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
              <p className="text-sm font-semibold">Bank: <span className="font-normal">Palmpay</span></p>
              <p className="text-sm font-semibold">Account no.: <span className="font-normal">7026057454</span></p>
              <p className="text-sm font-semibold">Account name: <span className="font-normal">Clinton Kenechukwu</span></p>
              <p className="text-sm font-semibold">Description: <span className="font-normal">Bills</span></p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const details = `Bank: Palmpay\nAccount no.: 7026057454\nAccount name: Clinton Kenechukwu\nDescription: Bills`;
                  navigator.clipboard.writeText(details);
                  toast.success('Account details copied');
                }}
                className="flex-1"
              >
                Copy Details
              </Button>
              <Button
                onClick={() => setShowManualAddFundsDialog(false)}
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

      <div className="pt-24 relative z-10">
        {/* Banner Section with Welcome Badge - Full Width */}
        <div className="relative mb-6 animate-in fade-in slide-in-from-top duration-500">
          {/* Welcome badge positioned slightly above banner - smaller on mobile */}
          <div className="absolute -top-3 right-2 md:-top-4 md:right-6 z-10">
            <div className="flex items-center gap-1 md:gap-2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl px-2 py-1 md:px-4 md:py-2 rounded-full shadow-xl border-2 border-white/70 dark:border-gray-700">
              <span className="text-xs md:text-base text-gray-700 dark:text-gray-300 font-medium">
                {user.name || user.email.split('@')[0]}
              </span>
              <BadgeCheck className="h-3 w-3 md:h-5 md:w-5 text-blue-600" />
              <span className="text-[10px] md:text-sm text-gray-600 dark:text-gray-400 font-semibold">welcome back</span>
            </div>
          </div>
          
          <a 
            href="https://chat.whatsapp.com/Jyr22tl4NNA6GJ5dXIpAlv?mode=wwt" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block relative overflow-hidden rounded-2xl shadow-xl border-2 border-white/60 dark:border-gray-800 hover:border-blue-400 transition-colors mx-auto w-3/4 md:w-full"
          >
            <img
              src={bannerImg}
              alt="Premium products banner"
              className="w-full h-7 md:h-44 object-cover select-none"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 via-purple-900/20 to-pink-900/20 mix-blend-multiply"></div>
          </a>
          
          {/* Title moved below banner */}
          <h1 className="mt-6 text-center text-3xl md:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 tracking-tight">
            Shop Premium Products
          </h1>
        </div>

        <div className="px-6">
          <div className="container mx-auto">
            
            {/* Header Section (subtitle only now, main title moved into banner) */}
            <div className="text-center mb-8 md:mb-12 animate-in fade-in slide-in-from-top duration-700">
              <p className="text-sm md:text-xl text-gray-700 dark:text-gray-300 max-w-3xl mx-auto">Discover our curated collection of high-quality social media accounts</p>
            </div>

            {/* Wallet Section */}
            <Card className="mb-6 md:mb-8 bg-white/90 dark:bg-gray-900/80 backdrop-blur-xl shadow-2xl border-2 border-white/60 dark:border-gray-800 animate-in fade-in slide-in-from-left duration-700">
              <CardHeader className="pb-3 md:pb-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 md:gap-3">
                    <button
                      className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
                      title="View deposit history"
                      onClick={() => setShowDepositHistory(true)}
                    >
                      <Banknote className="w-6 h-6 text-white" />
                    </button>
      {/* Deposit history modal component inline */}
      {showDepositHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-6 w-full max-w-md mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2"><Banknote className="w-5 h-5 text-blue-600" /> Deposits</h2>
              <button onClick={() => setShowDepositHistory(false)} className="text-gray-500 hover:text-red-500 text-xl">&times;</button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {depositHistory.length === 0 ? (
                <div className="text-gray-500 text-center py-8">No deposits found.</div>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                  {depositHistory.map((d, i) => (
                    <li key={d._id || i} className="py-3 flex flex-col gap-1">
                      <span className="font-semibold text-blue-700 dark:text-blue-400">₦{d.amount?.toFixed(2)}</span>
                      <span className="text-xs text-gray-600 dark:text-gray-400">{d.method?.toUpperCase()} • {d.status?.toUpperCase()}</span>
                      <span className="text-xs text-gray-400">{new Date(d.createdAt).toLocaleString()}</span>
                      {d.reference && <span className="text-xs text-gray-400">Ref: {d.reference}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                      <Wallet className="h-5 w-5 md:h-6 md:w-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg md:text-2xl bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-purple-700">Your Wallet</CardTitle>
                      <CardDescription className="text-sm md:text-lg font-semibold text-gray-700 dark:text-gray-300">Balance: <span className="text-blue-600">₦{Math.max(0, user.balance || 0).toFixed(2)}</span></CardDescription>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    onClick={handleSignOut} 
                    className="hover:bg-red-50 hover:text-red-600 transition-all duration-300 flex items-center gap-2 text-sm md:text-base h-9 md:h-auto"
                  >
                    <LogOut className="h-4 w-4 md:h-5 md:w-5" />
                    <span>Sign Out</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-col sm:flex-row gap-2 md:gap-3">
                  <Input
                    type="number"
                    placeholder="Enter amount"
                    value={addFundsAmount}
                    onChange={(e) => setAddFundsAmount(e.target.value)}
                    min="0"
                    step="0.01"
                    className="h-10 md:h-12 border-2 border-gray-200 dark:border-gray-700 focus:border-purple-500 transition-all duration-300 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm md:text-base"
                  />
                  <Button 
                    onClick={handleAddFunds}
                    className="h-10 md:h-12 px-4 md:px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl text-sm md:text-base w-full sm:w-auto"
                  >
                    <Plus className="h-3 w-3 md:h-4 md:w-4 mr-2" />
                    Add Funds
                  </Button>
                </div>
                {/* Mobile-only manual add funds button */}
                <div className="mt-2 md:hidden px-1">
                  <button
                    type="button"
                    onClick={() => setShowManualAddFundsDialog(true)}
                    className="w-full inline-flex items-center justify-center px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 text-sm font-medium text-gray-800 border border-gray-200"
                  >
                    Add funds manually
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Products Section - Full Width on Mobile */}
        <div className="px-0 md:px-6">
          <div className="container mx-auto">
            {/* Products and Buy Dialog */}
            <div className="grid lg:grid-cols-1 gap-8">
              {/* Products Grid */}
              <div className="lg:col-span-1">
                <h2 
                  className="text-2xl md:text-4xl lg:text-5xl font-bold mb-6 md:mb-8 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 px-3 md:px-0"
                  style={{ fontFamily: 'Poppins, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}
                >
                  Our Products
                </h2>
                {/* Category Filters */}
                <div className="flex flex-wrap gap-2 md:gap-3 mb-6 md:mb-8 animate-in fade-in slide-in-from-left duration-500 px-3 md:px-0">
                  {categories.map(cat => (
                    <Button
                      key={cat}
                      variant={activeCategory === cat ? "default" : "outline"}
                      onClick={() => {
                        setActiveCategory(cat);
                        scrollToCategory(cat);
                      }}
                      className={`rounded-full px-3 md:px-5 py-1.5 md:py-2 text-xs md:text-sm font-semibold transition-all duration-300 shadow ${activeCategory === cat ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700' : 'bg-white/70 backdrop-blur border-2 border-white/60 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 dark:bg-gray-900/70 dark:border-gray-800 dark:hover:from-gray-800 dark:hover:to-gray-800 dark:text-gray-300'}`}
                    >
                      {cat}
                    </Button>
                  ))}
                </div>

                {/* Display products grouped by category */}
                {activeCategory === "All" ? (
                  // Show all categories with headings
                  <div className="space-y-8 md:space-y-12">
                    {categoriesWithProducts.map((category) => {
                      const categoryProducts = groupedProducts[category] || [];
                      const displayedProducts = getProductsToDisplay(category);
                      const hasMore = categoryProducts.length > 5;
                      const isExpanded = expandedCategories[category];

                      return (
                      <div key={category} id={`category-${category}`} className="scroll-mt-24">
                        <div className="flex items-center justify-between mb-4 md:mb-6 px-3 md:px-0">
                          <h3 className="text-xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 border-b-2 border-gray-200 dark:border-gray-800 pb-2 flex-1">
                            {category}
                          </h3>
                          {hasMore && (
                            <Button
                              variant="ghost"
                              onClick={() => toggleCategoryExpansion(category)}
                              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-semibold"
                            >
                              <span className="text-sm md:text-base">{isExpanded ? 'Show Less' : 'See More'}</span>
                              <ChevronDown className={`h-4 w-4 md:h-5 md:w-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                            </Button>
                          )}
                        </div>
                        <div className="space-y-3 md:space-y-4">
                          {displayedProducts.map((product, index) => {
                            const availableStock = (product.serialNumbers || []).filter(s => !s.isUsed).length;
                            
                            return (
                            <Card 
                              key={product.id} 
                              className="bg-white/90 backdrop-blur-xl shadow-lg border-2 border-l-0 border-r-0 md:border-l-2 md:border-r-2 border-white/60 hover:shadow-xl transition-all duration-300 group animate-in fade-in slide-in-from-bottom dark:bg-gray-900/90 dark:border-gray-800 mx-0 rounded-none md:rounded-lg"
                              style={{ animationDelay: `${index * 50}ms` }}
                            >
                              <CardContent className="p-0">
                                <div className="flex flex-col md:flex-row md:items-center gap-0 md:gap-4 md:p-4">
                                  {/* Top Section: Image and Info (Mobile Full Width) */}
                                  <div className="flex items-start gap-3 p-3 md:p-0 md:flex-1">
                                    {/* Small Product Image */}
                                    <div className="relative overflow-hidden rounded-lg flex-shrink-0">
                                      <div className="absolute inset-0 bg-gradient-to-br from-blue-400/0 to-purple-400/0 group-hover:from-blue-400/20 group-hover:to-purple-400/20 transition-all duration-300 z-10"></div>
                                      <img
                                        src={product.image}
                                        alt={product.name}
                                        className="w-12 h-12 md:w-16 md:h-16 object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
                                      />
                                    </div>
                                    
                                    {/* Product Info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start gap-2 mb-0.5 md:mb-1">
                                        <Badge variant="outline" className="px-1.5 md:px-2 py-0.5 text-xs tracking-wide bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700 border-none flex-shrink-0 dark:from-blue-950 dark:to-purple-950 dark:text-blue-400">
                                          {product.category}
                                        </Badge>
                                        {availableStock > 0 && (
                                          <Badge variant="outline" className="hidden md:inline-flex px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800">
                                              {availableStock} in stock
                                            </Badge>
                                          )}
                                        {availableStock === 0 && (
                                          <Badge variant="outline" className="hidden md:inline-flex px-1.5 py-0.5 text-[10px] bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800">
                                            Out of stock
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center justify-between gap-3 w-full">
                                        <h3 className="font-bold text-sm md:text-base lg:text-lg mb-0.5 md:mb-1 bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-purple-700 dark:from-blue-400 dark:to-purple-400 truncate md:whitespace-normal flex-1 min-w-0">{product.name}</h3>
                                        <p className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-400 dark:to-blue-300 flex-shrink-0">
                                          ₦{product.price.toFixed(2)}
                                        </p>
                                      </div>
                                    </div>
                                    
                                    {/* Price (Mobile - Right Side) */}
                                    <div className="text-right flex-shrink-0 md:hidden">
                                     
                                      {/* {availableStock === 0 && (
                                        <div className="mt-0.5">
                                          <Badge variant="outline" className="px-1.5 py-0.5 text-[10px] bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800">
                                            Out of stock
                                          </Badge>
                                        </div>
                                      )} */}
                                    </div>
                                  </div>

                                  {/* Description (Mobile Full Width) */}
                                  <div className="px-3 pb-3 md:hidden">
                                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-5">{product.description}</p>
                                  </div>

                                  {/* Desktop Layout: Description, Price, Button */}
                                  <div className="hidden md:flex md:items-center md:gap-4 md:flex-1">
                                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-5 flex-1">{product.description}</p>
                                    <div className="text-right flex-shrink-0">
                                      <p className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-400 dark:to-blue-300">
                                        ₦{product.price.toFixed(2)}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Buy Button and Price (Mobile Full Width) */}
                                  <div className="px-3 pb-3 md:p-0 md:flex-shrink-0 md:hidden flex items-center justify-between gap-2">
                                    <Button 
                                      onClick={() => handleBuyClick(product)}
                                      disabled={availableStock === 0}
                                      className={`h-8 px-3 ${availableStock === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-blue-400 hover:from-blue-700 hover:to-blue-500'} text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 rounded-lg text-xs`}
                                    >
                                      <ShoppingCart className="h-3 w-3 mr-1" />
                                      {availableStock === 0 ? 'Out of Stock' : 'Buy Now'}
                                    </Button>
                                    <div className="flex flex-col items-end">
                                      {/* <span className="text-base font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-400 dark:to-blue-300">
                                        ₦{product.price.toFixed(2)}
                                      </span> */}
                                      {availableStock > 0 ? (
                                        <Badge variant="outline" className="mt-1 px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800 block">
                                          {availableStock} in stock
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="mt-1 px-1.5 py-0.5 text-[10px] bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800 block">
                                          Out of stock
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                            );
                          })}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  // Show single category
                  <div id={`category-${activeCategory}`} className="scroll-mt-24">
                    {(() => {
                      const categoryProducts = groupedProducts[activeCategory] || [];
                      const displayedProducts = getProductsToDisplay(activeCategory);
                      const hasMore = categoryProducts.length > 5;
                      const isExpanded = expandedCategories[activeCategory];

                      return (
                        <>
                          <div className="flex items-center justify-between mb-4 md:mb-6 px-3 md:px-0">
                            <h3 className="text-xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 border-b-2 border-gray-200 dark:border-gray-800 pb-2 flex-1">
                              {activeCategory}
                            </h3>
                            {hasMore && (
                              <Button
                                variant="ghost"
                                onClick={() => toggleCategoryExpansion(activeCategory)}
                                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-semibold"
                              >
                                <span className="text-sm md:text-base">{isExpanded ? 'Show Less' : 'See More'}</span>
                                <ChevronDown className={`h-4 w-4 md:h-5 md:w-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                              </Button>
                            )}
                          </div>
                          <div className="space-y-3 md:space-y-4">
                            {displayedProducts.map((product, index) => {
                        const availableStock = (product.serialNumbers || []).filter(s => !s.isUsed).length;
                        
                        return (
                        <Card 
                          key={product.id} 
                          className="bg-white/90 backdrop-blur-xl shadow-lg border-2 border-l-0 border-r-0 md:border-l-2 md:border-r-2 border-white/60 hover:shadow-xl transition-all duration-300 group animate-in fade-in slide-in-from-bottom dark:bg-gray-900/90 dark:border-gray-800 mx-0 rounded-none md:rounded-lg"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <CardContent className="p-0">
                            <div className="flex flex-col md:flex-row md:items-center gap-0 md:gap-4 md:p-4">
                              {/* Top Section: Image and Info (Mobile Full Width) */}
                              <div className="flex items-start gap-3 p-3 md:p-0 md:flex-1">
                                {/* Small Product Image */}
                                <div className="relative overflow-hidden rounded-lg flex-shrink-0">
                                  <div className="absolute inset-0 bg-gradient-to-br from-blue-400/0 to-purple-400/0 group-hover:from-blue-400/20 group-hover:to-purple-400/20 transition-all duration-300 z-10"></div>
                                  <img
                                    src={product.image}
                                    alt={product.name}
                                    className="w-12 h-12 md:w-16 md:h-16 object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
                                  />
                                </div>
                                
                                {/* Product Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start gap-2 mb-0.5 md:mb-1">
                                    <Badge variant="outline" className="px-1.5 md:px-2 py-0.5 text-xs tracking-wide bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700 border-none flex-shrink-0 dark:from-blue-950 dark:to-purple-950 dark:text-blue-400">
                                      {product.category}
                                    </Badge>
                                    {availableStock > 0 && (
                                      <Badge variant="outline" className="hidden md:inline-flex px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800">
                                        {availableStock} in stock
                                      </Badge>
                                    )}
                                    {availableStock === 0 && (
                                      <Badge variant="outline" className="hidden md:inline-flex px-1.5 py-0.5 text-[10px] bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800">
                                        Out of stock
                                      </Badge>
                                    )} 
                                  </div>
                                  <h3 className="font-bold text-sm md:text-base lg:text-lg mb-0.5 md:mb-1 bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-purple-700 dark:from-blue-400 dark:to-purple-400 truncate md:whitespace-normal">{product.name}</h3>
                                  {/* Desktop-only stock line under product name to avoid name overflow */}
                                  {availableStock > 0 ? (
                                    <div className="hidden md:block mt-1">
                                      <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800">
                                        {availableStock} in stock
                                      </Badge>
                                    </div>
                                  ) : (
                                    <div className="hidden md:block mt-1">
                                      <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800">
                                        Out of stock
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Price (Mobile) - moved to buy button area to avoid duplication */}
                                <div className="hidden" />
                              </div>

                              {/* Description (Mobile Full Width) */}
                              <div className="px-3 pb-3 md:hidden">
                                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-5">{product.description}</p>
                              </div>

                              {/* Desktop Layout: Description, Price, Button */}
                              <div className="hidden md:flex md:items-center md:gap-4 md:flex-1">
                                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-5 flex-1">{product.description}</p>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-400 dark:to-blue-300">
                                    ₦{product.price.toFixed(2)}
                                  </p>
                                </div>
                              </div>

                              {/* Buy Button and Price (Mobile Full Width) */}
                              <div className="px-3 pb-3 md:p-0 md:flex-shrink-0 md:hidden flex items-center justify-between gap-2">
                                <Button 
                                  onClick={() => handleBuyClick(product)}
                                  disabled={availableStock === 0}
                                  className={`h-8 px-3 ${availableStock === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-blue-400 hover:from-blue-700 hover:to-blue-500'} text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 rounded-lg text-xs`}
                                >
                                  <ShoppingCart className="h-3 w-3 mr-1" />
                                  {availableStock === 0 ? 'Out of Stock' : 'Buy Now'}
                                </Button>
                                <div className="flex flex-col items-end">
                                  <span className="text-base font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-400 dark:to-blue-300">
                                    ₦{product.price.toFixed(2)}
                                  </span>
                                  {availableStock > 0 ? (
                                    <Badge variant="outline" className="mt-1 px-1.5 py-0.5 text-[10px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800 block">
                                      {availableStock} in stock
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="mt-1 px-1.5 py-0.5 text-[10px] bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800 block">
                                      Out of stock
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        );
                      })}
                    </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
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
                    src={selectedProduct.image}
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
                        const maxStock = (selectedProduct.serialNumbers || []).filter(s => !s.isUsed).length;
                        setPurchaseQuantity(Math.min(maxStock, purchaseQuantity + 1));
                      }}
                      disabled={purchaseQuantity >= ((selectedProduct.serialNumbers || []).filter(s => !s.isUsed).length)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
                  {((selectedProduct.serialNumbers || []).filter(s => !s.isUsed).length)} units available
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
                <Card key={index} className="bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      {/* Product Image */}
                      <div className="relative overflow-hidden rounded-lg flex-shrink-0">
                        <img
                          src={item.image}
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
      <div className="fixed bottom-8 left-6 z-50">
        <a
          href="https://chat.whatsapp.com/Jyr22tl4NNA6GJ5dXIpAlv?mode=wwt"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-14 h-14 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-2xl hover:scale-110 transition-all duration-300"
          aria-label="Contact us on WhatsApp"
        >
          <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>
      </div>

      <div className="fixed bottom-8 right-6 z-50">
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
    </div>
  );
};

export default Shop;
