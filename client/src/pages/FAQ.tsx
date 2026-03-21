import Navbar from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";

const faqItems = [
  {
    question: "What does Legit Store offer?",
    answer: "Legit Store is a digital marketplace for social media accounts, verification-ready services, and related account products with fast delivery after purchase.",
  },
  {
    question: "How do I buy a product?",
    answer: "Create an account, sign in, fund your wallet, choose a category or search for a product, then complete checkout from the shop page.",
  },
  {
    question: "How is delivery handled?",
    answer: "After a successful purchase, available serials or account details are assigned automatically and shown in your purchase summary and history.",
  },
  {
    question: "How do wallet top-ups work?",
    answer: "You can add funds through the supported payment flow from your wallet area. Once payment is verified, your wallet balance updates automatically.",
  },
  {
    question: "Can I search for products before signing in?",
    answer: "Yes. Use the homepage navbar search to look for products by name, and use the category dropdown to jump directly into filtered shop results.",
  },
  {
    question: "Where can I get support?",
    answer: "You can use the WhatsApp and Telegram contact links shown on the homepage for assistance with payments, orders, or account access.",
  },
];

const FAQ = () => {
  return (
    <main className="min-h-screen bg-[#f8f5ee] pb-20 text-slate-900 transition-colors duration-300 dark:bg-[#020409] dark:text-slate-100">
      <Navbar />

      <section className="px-6 pt-28 md:pt-32">
        <div className="container mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">Support</p>
            <h1 className="mt-4 text-4xl font-bold text-blue-700 dark:text-blue-400 md:text-6xl">Frequently Asked Questions</h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 dark:text-slate-300 md:text-lg">
              Quick answers about shopping, payments, delivery, and how Legit Store works.
            </p>
          </div>

          <div className="space-y-4">
            {faqItems.map((item) => (
              <Card key={item.question} className="border-white/60 bg-white/75 backdrop-blur-xl dark:border-white/10 dark:bg-black/55">
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold text-blue-700 dark:text-blue-400">{item.question}</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300 md:text-base">{item.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};

export default FAQ;