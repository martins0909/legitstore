import { catalogAPI, catalogCategoriesAPI, API_BASE } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import heroBackground from "@/assets/navbarbanner.jfif";
import logo from "@/assets/imagebackground.png";
import customerImage from "@/assets/customer.jpg";
import boardImage from "@/assets/board.jpg";
import { ShoppingBag, Shield, Zap, CreditCard, Globe2, Users, Star, Quote } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { motion } from "framer-motion";

interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  image: string;
  description: string;
  category: string;
  stockCount: number;
}

const testimonials = [
  {
    name: "James T.",
    product: "USA Aged Facebook Ads Account",
    review: "The accounts provided were top quality and perfectly aged. Delivered instantly and I haven't faced any restrictions since running ads. Literally the best service I've found so far.",
    rating: 5,
    date: "1 day ago"
  },
  {
    name: "Cynthia M.",
    product: "Premium TikTok Agency Account",
    review: "I was skeptical at first, but everything worked out smoothly. Support was top-tier, answering all my questions before the purchase. Will definitely be utilizing Legitstorez.com for my agency again.",
    rating: 5,
    date: "3 days ago"
  },
  {
    name: "Michael K.",
    product: "Verified Twitter/X Blueprint",
    review: "Fast deposit via Ercas and immediate delivery of the product. The verification held up perfectly, exactly as described in the product details. Saves me so much time.",
    rating: 5,
    date: "1 week ago"
  },
];

/**
 * Index Page – LegitStore Landing Page
 * Modern, semantic, and accessible version without altering the UI.
 */
const Index = () => {
  const navigate = useNavigate();
  const accentTextClass = "text-blue-700 dark:text-blue-400";
  const accentSoftTextClass = "text-blue-600 dark:text-blue-400";
  const [homeProducts, setHomeProducts] = useState<CatalogProduct[]>([]);
  const [homeCategories, setHomeCategories] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [products, categories] = await Promise.all([
          catalogAPI.getAll(),
          catalogCategoriesAPI.getAll(),
        ]);

        if (!mounted) {
          return;
        }

        setHomeProducts(
          products.map(({ id, name, price, image, description, category, stockCount, serialNumbers }) => ({
            id,
            name,
            price,
            image,
            description,
            category,
            stockCount: stockCount ?? (Array.isArray(serialNumbers) ? serialNumbers.filter((serial) => !serial.isUsed).length : 0),
          })),
        );
        setHomeCategories(categories.map((category) => category.name));
      } catch {
        if (!mounted) {
          return;
        }

        setHomeProducts([]);
        setHomeCategories([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const homeProductsByCategory = homeProducts.reduce((accumulator, product) => {
    if (!accumulator[product.category]) {
      accumulator[product.category] = [];
    }

    accumulator[product.category].push(product);
    return accumulator;
  }, {} as Record<string, CatalogProduct[]>);

  const displayedHomeCategories = (homeCategories.length > 0 ? homeCategories : Object.keys(homeProductsByCategory))
    .filter((category) => (homeProductsByCategory[category] || []).length > 0);

  return (
  <main className="relative flex min-h-screen flex-col overflow-hidden bg-white transition-colors duration-300 dark:bg-transparent">
      
      {/* 🧭 Navbar */}
      <Navbar />

      {/* 🏠 Hero Section */}
      <section
        id="home"
        className="relative pt-24 md:pt-32 pb-12 md:pb-20 px-6 overflow-hidden"
        aria-label="Welcome to LegitStore"
      >
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${heroBackground})` }}
        />
        <div className="absolute inset-0 bg-blue-950/62 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/28 via-blue-900/18 to-blue-950/26" />
        <div className="container mx-auto relative z-10">
          <div className="max-w-4xl mx-auto">
            {/* 📝 Hero Text */}
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="space-y-6 rounded-[2rem] border border-white/20 bg-white/12 px-6 py-10 backdrop-blur-sm md:space-y-8 md:px-10 md:py-14 text-center"
            >
              <div className="space-y-3 md:space-y-4">
                <h3 className="text-lg font-medium text-blue-100 md:text-xl lg:text-2xl">
                  Welcome to
                </h3>
                <h1
                  className="text-4xl font-bold leading-tight text-white drop-shadow-2xl md:text-6xl lg:text-7xl"
                  style={{ fontFamily: 'Poppins, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}
                >
                  Legit Store
                </h1>
              </div>

              <p className="mx-auto max-w-2xl text-base leading-relaxed text-blue-50 md:text-xl lg:text-2xl">
                Your trusted marketplace for <span className="font-semibold text-white">authentic social media accounts</span> designed to last and serve you better.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-4 justify-center">
                <Button
                  size="lg"
                  onClick={() => navigate("/auth")}
                  aria-label="Get started on LegitStore"
                  className="h-12 md:h-14 px-6 md:px-8 bg-blue-700 hover:bg-blue-800 text-white text-base md:text-lg font-semibold shadow-2xl shadow-blue-900/30 hover:shadow-blue-900/40 transition-all duration-300 transform hover:scale-[1.05] rounded-xl w-full sm:w-auto"
                >
                  <span className="flex items-center gap-2 justify-center">
                    Get Started
                    <ShoppingBag className="w-4 h-4 md:w-5 md:h-5" />
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() =>
                    document
                      .getElementById("about")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                  aria-label="Learn more about LegitStore"
                  className="h-12 md:h-14 px-6 md:px-8 text-base md:text-lg font-semibold border-2 border-blue-500 text-blue-700 hover:bg-white/80 backdrop-blur-sm transition-all duration-300 rounded-xl w-full sm:w-auto dark:text-blue-300 dark:border-blue-400"
                >
                  Learn More
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ℹ️ About Section */}
      <section id="about" className="px-2 py-16 transition-colors duration-300 bg-white dark:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] dark:from-slate-800 dark:via-[#020617] dark:to-black dark:text-white md:px-6 md:py-24" aria-labelledby="about-title">
        <div className="w-full md:container md:mx-auto">
          <div className="grid items-start gap-8 md:grid-cols-[1.04fr_0.96fr] md:gap-10">
            <motion.div 
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.7 }}
              className="order-2 space-y-5 md:order-1"
            >
              <div className="space-y-4 rounded-[2rem] border border-slate-200 bg-white/70 p-6 transition-all duration-300 dark:border-white/10 dark:bg-slate-900/40 md:p-8 backdrop-blur-sm shadow-sm hover:shadow-xl hover:-translate-y-1">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-blue-700 dark:border-white/10 dark:bg-slate-800/60 dark:text-white backdrop-blur-sm">
                  <Users className="h-4 w-4" />
                  Trusted Marketplace
                </div>

                <div>
                  <h2
                    id="about-title"
                    className={`text-3xl font-bold leading-tight md:text-5xl lg:text-6xl text-blue-700 dark:text-white`}
                    style={{ fontFamily: 'Poppins, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}
                  >
                    About LegitStore
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-700 dark:text-slate-200 md:text-lg">
                    We offer a wide range of accounts tailored to various needs. Professional social media growth services built for users who want dependable digital products and a clean buying experience.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-white/60 p-4 transition-all duration-300 dark:border-white/10 dark:bg-slate-800/30 backdrop-blur-sm hover:bg-white/80 dark:hover:bg-slate-800/50 hover:shadow-md">
                    <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-white">
                      <Globe2 className="h-4 w-4" />
                      Social Platforms
                    </div>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-200">
                      Foreign & local Facebook, Instagram, TikTok, YouTube, Twitter, Discord accounts, old email, Twitch, and many more.
                    </p>
                  </div>
                  <div className="rounded-[1.5rem] border border-slate-200 bg-white/60 p-4 transition-all duration-300 dark:border-white/10 dark:bg-slate-800/30 backdrop-blur-sm hover:bg-white/80 dark:hover:bg-slate-800/50 hover:shadow-md">
                    <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-white">
                      <Shield className="h-4 w-4" />
                      Verification Support
                    </div>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-200">
                      Virtual numbers for WhatsApp, Telegram, SMS, and OTP verification to support fast and smooth account setup.
                    </p>
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-slate-200 bg-white/60 px-5 py-5 transition-all duration-300 dark:border-white/10 dark:bg-slate-800/30 backdrop-blur-sm hover:shadow-md">
                  <p className="text-sm leading-7 text-slate-700 dark:text-slate-200 md:text-base">
                    We will help you gain more followers and boost your account. With thousands of satisfied customers worldwide, we have built a reputation for reliability, quality, and customer satisfaction.
                  </p>
                  <p className="mt-3 text-sm leading-7 text-slate-700 dark:text-slate-200 md:text-base">
                    Join our community today and experience the difference.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 md:gap-5">
              {[
                {
                  icon: <ShoppingBag className="h-6 w-6 md:h-8 md:w-8 text-blue-700 dark:text-white" />,
                  title: "Wide Product Range",
                  desc: "Facebook, Instagram, TikTok, YouTube, Twitter and more in one place.",
                },
                {
                  icon: <Shield className="h-6 w-6 md:h-8 md:w-8 text-blue-700 dark:text-white" />,
                  title: "Verification Tools",
                  desc: "WhatsApp, Telegram, SMS and OTP virtual numbers for smooth verification.",
                },
                {
                  icon: <Zap className="h-6 w-6 md:h-8 md:w-8 text-blue-700 dark:text-white" />,
                  title: "Fast Fulfilment",
                  desc: "Bright, simple checkout with delivery designed for quick account access.",
                },
                {
                  icon: <CreditCard className="h-6 w-6 md:h-8 md:w-8 text-blue-700 dark:text-white" />,
                  title: "Trusted Payments",
                  desc: "Reliable funding options and a service flow built around customer confidence.",
                },
              ].map((feature) => (
                <article
                  key={feature.title}
                  className="rounded-[1.5rem] border border-slate-200 bg-white/70 p-5 transition-all duration-300 dark:border-white/10 dark:bg-slate-800/30 backdrop-blur-sm hover:-translate-y-1 hover:shadow-lg dark:hover:bg-slate-800/50"
                >
                  <div className="mb-4 inline-flex rounded-2xl bg-blue-50 p-3 text-blue-700 dark:bg-slate-800/80 dark:text-blue-300">
                    {feature.icon}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white md:text-lg">{feature.title}</h3>
                  <p className="mt-2 text-xs leading-6 text-slate-600 dark:text-slate-200 md:text-sm">{feature.desc}</p>
                </article>
              ))}
            </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.7 }}
              className="order-1 grid gap-4 md:order-2 md:grid-rows-[1.15fr_0.85fr]"
            >
              <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white transition-colors duration-300 dark:border-white/10 dark:bg-slate-800/40">
                <img
                  src={customerImage}
                  alt="Satisfied LegitStore customers"
                  className="h-64 w-full object-cover md:h-full"
                />
                <div className="border-t border-slate-200 px-5 py-4 dark:border-white/10">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-white">
                    <Users className="h-4 w-4" />
                    Customer Satisfaction
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-200">
                    Thousands of customers trust LegitStore for reliable service, quality products, and consistent support.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
                <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white transition-colors duration-300 dark:border-white/10 dark:bg-slate-800/40">
                  <img
                    src={boardImage}
                    alt="LegitStore team working around the clock for customer satisfaction"
                    className="h-56 w-full object-cover md:h-full"
                  />
                </div>
                <div className="rounded-[2rem] border border-slate-200 bg-white px-5 py-5 transition-colors duration-300 dark:border-white/10 dark:bg-slate-800/40">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-white">
                    <Zap className="h-4 w-4" />
                    Always Available
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-700 dark:text-slate-200">
                    We work 24/7 to ensure customer satisfaction, fast responses, and a service experience that feels dependable every time.
                  </p>
                  <p className="mt-3 text-sm leading-7 text-slate-700 dark:text-slate-300">
                    From account delivery to verification tools, our focus stays on making every order smooth and trustworthy.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* 🛍 Category Banner */}
      <section id="categories" className="relative py-16 md:py-24" aria-labelledby="categories-title">
        <div className="relative z-10 w-full max-w-none">
          <motion.header 
            initial={{ opacity: 0, y: -20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="mb-5 px-6 text-center md:mb-8"
          >
            <h2 
              id="categories-title" 
              className={`text-3xl md:text-5xl lg:text-6xl font-bold ${accentTextClass}`}
              style={{ fontFamily: 'Poppins, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}
            >
              LOGs
            </h2>
          </motion.header>

          <div className="space-y-6 md:space-y-8">
            {displayedHomeCategories.length > 0 ? displayedHomeCategories.map((category, index) => {
              const products = homeProductsByCategory[category] || [];

              return (
                <motion.div 
                  key={category} 
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="border-y border-slate-200 bg-[#f8fbff] dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div className="bg-blue-700 px-4 py-2 text-white md:px-6 md:py-3">
                    <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                      <div>
                        <h3 className="text-lg font-bold md:text-2xl">{category}</h3>
                      </div>
                      <div className="mt-1 ml-auto inline-grid w-full max-w-[320px] grid-cols-[72px_minmax(92px,1fr)_78px] items-center justify-items-center gap-3 self-end rounded-full border border-white/35 bg-white/28 px-3 py-1.5 text-center shadow-[0_8px_20px_rgba(15,23,42,0.12)] backdrop-blur-md md:mt-2 md:ml-0 md:min-w-[338px] md:w-auto md:grid-cols-[84px_110px_112px] md:gap-4 md:px-4">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white md:text-xs md:tracking-[0.22em]">Stock</span>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white md:text-xs md:tracking-[0.22em]">Price</span>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white md:text-xs md:tracking-[0.22em]">Action</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    {products.map((product) => {
                      return (
                        <article key={product.id} className="border-t border-slate-200 px-4 py-3 first:border-t-0 md:px-6 dark:border-slate-800">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-900 md:h-12 md:w-12">
                                <img
                                    src={product.image || `${API_BASE}/api/catalog/${product.id}/image`}
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

                            <div className="ml-auto grid w-full max-w-[320px] grid-cols-[72px_minmax(92px,1fr)_78px] items-center justify-items-center gap-3 border-t border-slate-200 pt-3 text-center md:ml-0 md:min-w-[338px] md:w-auto md:grid-cols-[84px_110px_112px] md:gap-4 md:border-t-0 md:pt-0 dark:border-slate-800">
                              <div className="flex w-full justify-center">
                                <div className="mt-1 inline-flex min-w-[66px] items-center justify-center rounded-full bg-blue-50 px-2.5 py-1 text-sm font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                                  {product.stockCount}pcx
                                </div>
                              </div>

                              <div className="flex w-full justify-center">
                                <div className="mt-1 inline-flex min-w-[92px] items-center justify-center rounded-full bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  ₦{Number.isInteger(product.price) ? product.price : product.price.toFixed(2)}
                                </div>
                              </div>

                              <div className="flex w-full justify-center">
                                <Button
                                  onClick={() => navigate(`/shop?category=${encodeURIComponent(category)}&search=${encodeURIComponent(product.name)}`)}
                                  className="mt-1 h-7 w-full max-w-[78px] rounded-full bg-blue-600 px-2 text-[11px] font-semibold text-white hover:bg-blue-500 md:h-8 md:max-w-none md:px-3 md:text-sm"
                                >
                                  Buy
                                </Button>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </motion.div>
              );
            }) : (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="border-y border-slate-200 bg-[#f8fbff] px-6 py-10 text-center shadow-[0_18px_50px_rgba(15,23,42,0.04)] md:mx-6 md:rounded-[1.5rem] md:border dark:border-slate-800 dark:bg-slate-900/70"
              >
                <h3 className={`text-2xl font-bold ${accentTextClass}`}>Categories will appear here</h3>
                <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
                  Add products and categories in the admin area to populate this banner automatically.
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* ⭐ Customer Trust and Testimonies */}
      <section className="relative z-10 px-4 py-16 md:px-6 md:py-24 mx-auto max-w-7xl">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-orange-600 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400 mb-4">
            <Star className="h-3.5 w-3.5 fill-current" />
            CUSTOMER TRUST
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-5xl lg:text-6xl dark:text-white">
            Loved by Thousands
          </h2>
          <p className="mt-4 text-base md:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            Don't just take our word for it. See what our customers are saying about our premium accounts, fast delivery, and unmatched support.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {testimonials.map((testimonial, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative flex flex-col rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-xl dark:border-white/10 dark:bg-slate-900/40 dark:hover:bg-slate-900/60 md:p-8 backdrop-blur-sm group"
            >
              <Quote className="absolute top-6 right-6 h-10 w-10 text-blue-100 dark:text-blue-900/40 transition-transform group-hover:scale-110" />
              
              <div className="flex items-center gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, starIndex) => (
                  <Star 
                    key={starIndex} 
                    className={`h-4 w-4 md:h-5 md:w-5 ${starIndex < testimonial.rating ? "text-orange-400 fill-orange-400" : "text-slate-300 dark:text-slate-700"}`} 
                  />
                ))}
              </div>
              
              <div className="flex-1">
                <p className="text-base leading-relaxed text-slate-700 dark:text-slate-300">
                  "{testimonial.review}"
                </p>
              </div>
              
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                <div className="flex flex-col">
                  <span className="font-bold text-slate-900 dark:text-white">{testimonial.name}</span>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mt-1">
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Bought: {testimonial.product}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">{testimonial.date}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 📜 Footer */}
      <motion.footer 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="relative z-10 mx-5 mb-5 mt-auto rounded-2xl border border-slate-200 bg-white px-6 py-12 dark:border-white/10 dark:bg-black/55 md:mx-6 md:mb-6"
      >
        <div className="container mx-auto flex flex-col items-center text-center">
          <img
            src={logo}
            alt="Legit Store Logo"
            className="h-14 w-auto object-contain"
          />

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm font-semibold text-blue-700 dark:text-blue-300">
            <Link to="/" className="transition-colors duration-200 hover:text-blue-500">Home</Link>
            <Link to="/faq" className="transition-colors duration-200 hover:text-blue-500">FAQ</Link>
            <Link to="/rules" className="transition-colors duration-200 hover:text-blue-500">Rules</Link>
          </div>

          <p className="mt-6 text-sm font-medium text-slate-600 dark:text-slate-400">
            © 2026 LegitStore. All rights reserved.
          </p>
        </div>
      </motion.footer>

      {/* Floating Social Support Icons */}
      {/* <div className="fixed bottom-8 left-6 z-50">
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

      <div className="fixed bottom-8 right-6 z-50">
        <a
          href="https://t.me/@Legit_support1"
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
          <span className="rounded-full bg-white/80 px-2 py-1 text-xs font-medium text-gray-700 shadow backdrop-blur dark:bg-slate-900/80 dark:text-slate-200">online agent</span>
        </a>
      </div>
    </main>
  );
};

export default memo(Index);
