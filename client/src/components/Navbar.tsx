import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { catalogCategoriesAPI } from "@/lib/api";
import { ChevronDown, History, Menu, Search, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLocation, useNavigate } from "react-router-dom";
import logo from "@/assets/imagebackground.png";

interface NavbarProps {
  isShopPage?: boolean;
  cartItemCount?: number;
  onCartClick?: () => void;
  shopCategories?: Array<{
    name: string;
    image: string;
    productCount: number;
  }>;
  activeShopCategory?: string;
  onShopCategorySelect?: (category: string) => void;
  onShopCategoryMenuOpen?: () => void;
}

const Navbar = ({
  isShopPage = false,
  cartItemCount = 0,
  onCartClick,
  shopCategories = [],
  activeShopCategory = "All",
  onShopCategorySelect,
  onShopCategoryMenuOpen,
}: NavbarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchText, setSearchText] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showSearchInput, setShowSearchInput] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearchText(params.get("search") || "");
  }, [location.search]);

  useEffect(() => {
    if (isShopPage) return;

    let mounted = true;

    (async () => {
      try {
        const data = await catalogCategoriesAPI.getAll();
        if (mounted) {
          setCategories(data.map((category) => category.name));
        }
      } catch {
        if (mounted) {
          setCategories([]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isShopPage]);

  useEffect(() => {
    setShowCategoryMenu(false);
    setShowSearchInput(false);
  }, [location.pathname]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = searchText.trim();
    const params = new URLSearchParams();

    if (trimmed) {
      params.set("search", trimmed);
    }

    navigate({
      pathname: "/shop",
      search: params.toString() ? `?${params.toString()}` : "",
    });
  };

  const handleCategorySelect = (category: string) => {
    if (isShopPage && onShopCategorySelect) {
      onShopCategorySelect(category);
      setShowCategoryMenu(false);
      return;
    }

    const params = new URLSearchParams();
    params.set("category", category);
    navigate({ pathname: "/shop", search: `?${params.toString()}` });
    setShowCategoryMenu(false);
  };

  const displayedCategories = isShopPage
    ? shopCategories.map((category) => category.name)
    : categories;

  return (
    <nav className="fixed left-5 right-5 top-5 z-50 rounded-2xl border border-white/40 bg-white/45 backdrop-blur-2xl shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-black/42 dark:shadow-[0_18px_40px_rgba(0,0,0,0.45)] md:left-6 md:right-6 md:top-6">
      <div className="container mx-auto px-4 py-3 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:min-w-[240px]">
            {(isShopPage || !isShopPage) && (
              <div className="relative md:hidden">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setShowSearchInput(false);
                    if (isShopPage && onShopCategoryMenuOpen) {
                      onShopCategoryMenuOpen();
                      return;
                    }
                    setShowCategoryMenu((current) => !current);
                  }}
                  className={isShopPage ? "h-9 w-9 rounded-none bg-transparent p-0 text-blue-700 shadow-none backdrop-blur-none hover:bg-transparent dark:text-blue-300" : "h-10 w-10 rounded-full bg-blue-700 text-white shadow-sm backdrop-blur-md hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"}
                  aria-label="Open categories menu"
                >
                  <Menu className={isShopPage ? "h-5 w-5" : "h-4 w-4"} />
                </Button>
                {showCategoryMenu && !isShopPage && (
                  <div className="absolute left-0 top-12 z-50 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-white/50 bg-white/90 p-2 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-black/88">
                    <div className="max-h-80 overflow-y-auto">
                      {displayedCategories.length > 0 ? displayedCategories.map((category) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => handleCategorySelect(category)}
                          className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-blue-700 transition-colors duration-200 hover:bg-blue-50 hover:text-blue-800 dark:text-blue-300 dark:hover:bg-slate-800"
                        >
                          {category}
                        </button>
                      )) : (
                        <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No categories yet</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => navigate("/")}>
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/30 to-purple-400/30 rounded-2xl blur-lg group-hover:blur-xl transition-all duration-300"></div>
                <img 
                  src={logo} 
                  alt="Legit Store Logo" 
                  className="h-12 w-auto object-contain relative z-10 group-hover:scale-110 transition-transform duration-300"
                />
              </div>
            </div>
          </div>

          <div className="hidden flex-1 md:block" />

          <div className="flex items-center justify-end gap-2 md:min-w-[220px] md:flex-nowrap">
            <div className="hidden md:block">
              <ThemeToggle />
            </div>

            {!isShopPage && (
              <>
                <div className="relative hidden md:block">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setShowSearchInput(false);
                      setShowCategoryMenu((current) => !current);
                    }}
                    className="h-10 rounded-full bg-blue-700 px-1 text-sm font-semibold text-white shadow-sm backdrop-blur-md hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    <span className="rounded-full px-3 py-1 text-white">Select Category</span>
                    <span className="mx-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/70" aria-hidden="true">
                      <ChevronDown className={`h-4 w-4 text-blue-500 transition-transform duration-200 dark:text-blue-200 ${showCategoryMenu ? "rotate-180" : ""}`} />
                    </span>
                  </Button>
                  {showCategoryMenu && (
                    <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-white/50 bg-white/85 p-2 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-black/88">
                      <div className="max-h-80 overflow-y-auto">
                        {displayedCategories.length > 0 ? displayedCategories.map((category) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => handleCategorySelect(category)}
                            className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-blue-700 transition-colors duration-200 hover:bg-blue-50 hover:text-blue-800 dark:text-blue-300 dark:hover:bg-slate-800"
                          >
                            {category}
                          </button>
                        )) : (
                          <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No categories yet</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate("/faq")}
                  className="hidden h-10 rounded-full bg-white/45 px-4 text-sm font-semibold text-blue-700 backdrop-blur-md hover:bg-blue-50 md:inline-flex dark:bg-black/50 dark:text-blue-300 dark:hover:bg-black/72"
                >
                  FAQ
                </Button>

                <div className="relative hidden md:block">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setShowCategoryMenu(false);
                      setShowSearchInput((current) => !current);
                    }}
                    className="h-10 w-10 rounded-full bg-white/45 text-blue-700 backdrop-blur-md hover:bg-blue-50 dark:bg-black/50 dark:text-blue-300 dark:hover:bg-black/72"
                    aria-label="Search products"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                  {showSearchInput && (
                    <div className="absolute right-0 top-12 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/50 bg-white/90 p-3 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-black/88">
                      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                        <Input
                          value={searchText}
                          onChange={(event) => setSearchText(event.target.value)}
                          placeholder="Enter product name"
                          className="h-10 border-slate-200/80 bg-white/70 text-sm dark:border-white/10 dark:bg-black/55"
                          aria-label="Enter product name"
                        />
                        <Button
                          type="submit"
                          size="icon"
                          className="h-10 w-10 rounded-full bg-blue-600 text-white hover:bg-blue-500"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => setShowSearchInput(false)}
                          className="h-10 w-10 rounded-full text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-800"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  )}
                </div>

                <div className="relative md:hidden">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setShowCategoryMenu(false);
                      setShowSearchInput((current) => !current);
                    }}
                    className="h-8 w-8 rounded-none bg-transparent p-0 text-blue-700 shadow-none backdrop-blur-none hover:bg-transparent dark:text-blue-300 dark:hover:bg-transparent"
                    aria-label="Search products"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                  {showSearchInput && (
                    <div className="absolute right-0 top-12 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/50 bg-white/90 p-3 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-black/88">
                      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                        <Input
                          value={searchText}
                          onChange={(event) => setSearchText(event.target.value)}
                          placeholder="Enter product name"
                          className="h-10 border-slate-200/80 bg-white/70 text-sm dark:border-white/10 dark:bg-black/55"
                          aria-label="Enter product name"
                        />
                        <Button
                          type="submit"
                          size="icon"
                          className="h-10 w-10 rounded-full bg-blue-600 text-white hover:bg-blue-500"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => setShowSearchInput(false)}
                          className="h-10 w-10 rounded-full text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-800"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              </>
            )}

            {!isShopPage && (
              <div className="md:hidden">
                <ThemeToggle className="h-8 w-8 rounded-none border-0 bg-transparent p-0 shadow-none backdrop-blur-none hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent" iconClassName="h-4 w-4" />
              </div>
            )}

            {isShopPage ? (
              <div className="relative group cursor-pointer" onClick={onCartClick}>
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400/15 to-purple-400/15 blur-sm group-hover:blur-md transition-all duration-300"></div>
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-600 transition-transform duration-300 group-hover:scale-105">
                  <History className="h-[18px] w-[18px] text-white" />
                  {cartItemCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-red-500 text-[10px] font-bold text-white shadow-lg animate-pulse">
                      {cartItemCount}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <Button 
                onClick={() => navigate("/auth")}
                className="h-8 rounded-full bg-blue-700 px-3 text-xs font-semibold text-white shadow-md transition-all duration-300 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 md:h-10 md:px-5 md:text-sm md:shadow-lg"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
