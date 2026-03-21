import Navbar from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";

const rules = [
  "Use the platform only for legitimate purchases and lawful account management activities.",
  "Complete payment with accurate details so wallet funding and order verification can be processed correctly.",
  "Do not share purchased account credentials publicly after delivery.",
  "Contact support promptly if you notice an order issue, payment mismatch, or access problem.",
  "Respect platform policies and avoid abusive, fraudulent, or automated misuse of the marketplace.",
];

const Rules = () => {
  return (
    <main className="min-h-screen bg-[#f8f5ee] pb-20 text-slate-900 transition-colors duration-300 dark:bg-[#020409] dark:text-slate-100">
      <Navbar />

      <section className="px-6 pt-28 md:pt-32">
        <div className="container mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">Guidelines</p>
            <h1 className="mt-4 text-4xl font-bold text-blue-700 dark:text-blue-400 md:text-6xl">Rules</h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 dark:text-slate-300 md:text-lg">
              These rules help keep LegitStore safe, clear, and easy to use for every customer.
            </p>
          </div>

          <Card className="border-white/60 bg-white/75 backdrop-blur-xl dark:border-white/10 dark:bg-black/55">
            <CardContent className="p-6 md:p-8">
              <ol className="space-y-4 text-sm leading-7 text-slate-600 dark:text-slate-300 md:text-base">
                {rules.map((rule) => (
                  <li key={rule} className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-950/80">
                    {rule}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default Rules;