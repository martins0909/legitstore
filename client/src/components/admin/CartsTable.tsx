import { useEffect, useState } from "react";
import { purchaseHistoryAPI, type PurchaseHistory as ApiPurchaseHistory } from "@/lib/api";
import { Search } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

// Align with API type to avoid mismatches
type PurchaseHistory = ApiPurchaseHistory;

export default function CartsTable({ token }: { token: string }) {
  const [purchases, setPurchases] = useState<PurchaseHistory[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchEmail, setSearchEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseHistory | null>(null);

  async function loadData(emailFilter?: string) {
    setLoading(true);
    setError(null);
    try {
  const data = await purchaseHistoryAPI.getAll(emailFilter);
  setPurchases(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [token]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    await loadData(searchEmail.trim() || undefined);
    setSearching(false);
  }

  function clearSearch() {
    if (searchEmail.trim().length === 0) return;
    setSearchEmail("");
    loadData();
  }

  function openDetails(purchase: PurchaseHistory) {
    setSelectedPurchase(purchase);
    setDetailsOpen(true);
  }

  if (loading) return <div className="p-4 text-center text-gray-600 dark:text-gray-400">Loading purchase history...</div>;
  if (error) return <div className="p-4 text-center text-red-600 bg-red-50 rounded-lg border border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-900">Error: {error}</div>;
  if (!purchases || purchases.length === 0) {
    return (
      <div className="p-4 text-center text-gray-600 dark:text-gray-400">
        {searchEmail.trim().length > 0 ? (
          <>No results for <span className="font-semibold">{searchEmail}</span>.</>
        ) : (
          <>No purchase history found.</>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
          Buy History ({purchases.length})
        </h2>
        <form onSubmit={handleSearch} className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by email..."
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              className="w-full md:w-64 pl-8 pr-20 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            {searchEmail && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-16 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >Clear</button>
            )}
            <button
              type="submit"
              disabled={searching}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-3 py-1 rounded-md transition-colors"
            >{searching ? 'Searching...' : 'Search'}</button>
          </div>
        </form>
      </div>
      <div className="overflow-x-auto rounded-xl border-2 border-gray-200 dark:border-gray-800">
        <table className="w-full table-auto border-collapse min-w-[700px]">
          <thead className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30">
            <tr className="text-left">
              <th className="p-3 md:p-4 text-sm md:text-base text-gray-700 dark:text-gray-300 font-semibold">Email</th>
              <th className="p-3 md:p-4 text-sm md:text-base text-gray-700 dark:text-gray-300 font-semibold">Product</th>
              <th className="p-3 md:p-4 text-sm md:text-base text-gray-700 dark:text-gray-300 font-semibold">Category</th>
              <th className="p-3 md:p-4 text-sm md:text-base text-gray-700 dark:text-gray-300 font-semibold">Qty</th>
              <th className="p-3 md:p-4 text-sm md:text-base text-gray-700 dark:text-gray-300 font-semibold">Price</th>
              <th className="p-3 md:p-4 text-sm md:text-base text-gray-700 dark:text-gray-300 font-semibold">Total</th>
              <th className="p-3 md:p-4 text-sm md:text-base text-gray-700 dark:text-gray-300 font-semibold">Date</th>
              <th className="p-3 md:p-4 text-sm md:text-base text-gray-700 dark:text-gray-300 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => {
              const total = (p.price || 0) * (p.quantity || 0);
              return (
                <tr key={p._id} className="border-t border-gray-200 dark:border-gray-800 hover:bg-blue-50/50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="p-3 md:p-4 text-sm md:text-base text-gray-800 dark:text-gray-200">{p.email || "—"}</td>
                  <td className="p-3 md:p-4 text-sm md:text-base text-gray-800 dark:text-gray-200">{p.name || "—"}</td>
                  <td className="p-3 md:p-4 text-sm md:text-base text-gray-800 dark:text-gray-200">{p.category || "—"}</td>
                  <td className="p-3 md:p-4 text-sm md:text-base text-gray-800 dark:text-gray-200">{p.quantity || 0}</td>
                  <td className="p-3 md:p-4 text-sm md:text-base text-gray-800 dark:text-gray-200">₦{(p.price || 0).toFixed(2)}</td>
                  <td className="p-3 md:p-4 text-sm md:text-base text-gray-800 dark:text-gray-200 font-semibold">₦{total.toFixed(2)}</td>
                  <td className="p-3 md:p-4 text-xs md:text-sm text-gray-800 dark:text-gray-200">{p.purchaseDate ? new Date(p.purchaseDate).toLocaleString() : "—"}</td>
                  <td className="p-3 md:p-4 text-sm md:text-base">
                    <Button variant="outline" size="sm" onClick={() => openDetails(p)}>
                      View description
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AlertDialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purchase details</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap">
              {selectedPurchase?.description?.trim()?.length ? selectedPurchase.description : "No description available for this purchase."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction onClick={() => setDetailsOpen(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
