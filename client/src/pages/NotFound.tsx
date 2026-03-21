import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-6 transition-colors duration-300 dark:bg-[#020409]">
      <div className="rounded-[2rem] border border-slate-200 bg-white/88 px-8 py-10 text-center shadow-xl backdrop-blur-xl transition-colors duration-300 dark:border-white/10 dark:bg-black/55">
        <h1 className="mb-4 text-4xl font-bold text-slate-950 dark:text-slate-100">404</h1>
        <p className="mb-4 text-xl text-gray-600 dark:text-slate-300">Oops! Page not found</p>
        <a href="/" className="text-blue-500 underline hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
