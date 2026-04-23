import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Mail, Lock, User, ArrowRight, Shield, Phone } from "lucide-react";
import { apiFetch, catalogAPI, catalogCategoriesAPI, warmBackend } from "@/lib/api";
import logo from "@/assets/imagebackground.png";
import heroBackground from "@/assets/navbarbanner.jfif";

const Auth = () => {
  const navigate = useNavigate();
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPhone, setSignUpPhone] = useState("");
  const [signUpName, setSignUpName] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [showWakingMessage, setShowWakingMessage] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!signInEmail || !signInPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsSigningIn(true);
    
    // Show "Waking server..." hint if request takes longer than 2s
    const wakingTimer = setTimeout(() => {
      setShowWakingMessage(true);
    }, 2000);
    
    try {
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signInEmail, password: signInPassword }),
      }) as { ok: boolean; user: { id: string; email: string; name?: string; balance: number } };

      localStorage.setItem("currentUser", JSON.stringify(data.user));
      toast.success("Welcome back!");
      // Fire-and-forget prefetch of shop data to speed up first render
      (async () => {
        try {
          const [prods, cats] = await Promise.all([
            catalogAPI.getAll(),
            catalogCategoriesAPI.getAll(),
          ]);
          sessionStorage.setItem("prefetch_products", JSON.stringify(prods));
          sessionStorage.setItem("prefetch_categories", JSON.stringify(cats));
        } catch { /* ignore */ }
      })();
      navigate("/shop");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid credentials");
    } finally {
      clearTimeout(wakingTimer);
      setShowWakingMessage(false);
      setIsSigningIn(false);
    }
  };

  // Warm backend and prefetch shop data proactively to reduce sign-in latency
  useEffect(() => {
    let mounted = true;
    // Warm the backend (non-blocking)
    warmBackend().catch(() => {});

    // Prefetch products and categories in the background and cache for quick shop hydration
    (async () => {
      try {
        const [prods, cats] = await Promise.all([
          catalogAPI.getAll(),
          catalogCategoriesAPI.getAll(),
        ]);
        if (!mounted) return;
        sessionStorage.setItem("prefetch_products", JSON.stringify(prods));
        sessionStorage.setItem("prefetch_categories", JSON.stringify(cats));
      } catch {
        // ignore prefetch errors
      }
    })();

    return () => { mounted = false; };
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!signUpEmail || !signUpPassword || !signUpConfirmPassword || !signUpPhone || !signUpName) {
      toast.error("Please fill in all fields");
      return;
    }

    if (signUpPhone.length !== 11) {
      toast.error("Phone number must be exactly 11 digits");
      return;
    }

    if (signUpPassword !== signUpConfirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    if (signUpPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsSigningUp(true);
    
    // Show "Waking server..." hint if request takes longer than 2s
    const wakingTimer = setTimeout(() => {
      setShowWakingMessage(true);
    }, 2000);
    
    try {
      const data = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signUpEmail, password: signUpPassword, name: signUpName, phone: signUpPhone }),
      }) as { ok: boolean; user: { id: string; email: string; name?: string; phone?: string; balance: number } };

      localStorage.setItem("currentUser", JSON.stringify(data.user));
      toast.success("Account created successfully!");
      navigate("/shop");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      clearTimeout(wakingTimer);
      setShowWakingMessage(false);
      setIsSigningUp(false);
    }
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetEmail) {
      toast.error("Please enter your email address");
      return;
    }

    // Mock password reset - in real app this would call backend API
    const mockUsers = JSON.parse(localStorage.getItem("users") || "[]");
    const userExists = mockUsers.find((u: { email: string }) => u.email === resetEmail);
    
    if (userExists) {
      // In a real app, this would send an email with a reset link
      toast.success(`Password reset link sent to ${resetEmail}. Check your inbox!`);
      setResetEmail("");
      setIsResetDialogOpen(false);
    } else {
      toast.error("No account found with this email address");
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-white dark:bg-slate-950 transition-colors duration-300">
      
      {/* 🌌 Left Pane - Marketing / Branding */}
      <div className="relative hidden md:flex md:w-1/2 lg:w-[45%] xl:w-[40%] flex-col justify-between overflow-hidden bg-slate-950 p-10 text-white shadow-2xl">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40 mix-blend-luminosity"
          style={{ backgroundImage: `url(${heroBackground})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-blue-950 via-blue-900/80 to-blue-950/40" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent opacity-80" />
        
        {/* Floating Shapes */}
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-blue-500/20 blur-[100px]" />
        <div className="absolute top-1/2 right-0 translate-x-1/2 h-80 w-80 rounded-full bg-purple-500/20 blur-[80px]" />
        
        <div className="relative z-10 flex items-center gap-3 cursor-pointer group" onClick={() => navigate("/")}>
          <div className="bg-white/10 p-2 rounded-xl backdrop-blur-md border border-white/20 group-hover:bg-white/20 transition-colors">
            <img src={logo} alt="Legit Store" className="h-8 w-auto mix-blend-screen" />
          </div>
          <span className="font-bold text-2xl tracking-tight">LegitStore</span>
        </div>

        <div className="relative z-10 mt-auto mb-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/20 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-blue-200 backdrop-blur-md shadow-inner">
            <Shield className="h-3.5 w-3.5" />
            100% Secure
          </div>
          <h1 className="text-4xl lg:text-5xl font-extrabold leading-tight mb-6" style={{ fontFamily: 'Poppins, ui-sans-serif, system-ui, -apple-system, Arial' }}>
            Unleash your social growth today.
          </h1>
          <p className="text-blue-100/80 text-lg max-w-md leading-relaxed">
            Log in to access your dashboard, discover exclusive robust social accounts, and scale your digital assets all in one secure place.
          </p>
          
          <div className="mt-12 flex items-center gap-4">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 w-10 rounded-full border-2 border-blue-900 bg-slate-300 overflow-hidden">
                   <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="User" />
                </div>
              ))}
            </div>
            <div className="text-sm font-medium text-blue-200">
              Join <span className="text-white font-bold">50k+</span> users
            </div>
          </div>
        </div>
      </div>

      {/* ⚡ Right Pane - Form */}
      <div className="relative flex flex-1 flex-col justify-center px-6 py-10 sm:py-12 sm:px-12 lg:px-24 bg-gradient-to-b from-blue-50/50 to-white dark:from-slate-900/50 dark:to-slate-950 md:bg-none">
        
        {/* Mobile Header elements hidden behind glassmorphism card */}
        <div className="absolute top-6 left-6 md:hidden flex items-center cursor-pointer z-0 opacity-50" onClick={() => navigate("/")}>
          <img src={logo} alt="Legit Store" className="h-8 w-auto mr-2" />
        </div>

        <div className="absolute top-6 right-6 z-20">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-full h-10 px-5 shadow-md shadow-blue-600/20 transition-all active:scale-95" onClick={() => navigate("/")}>
            Back to Home
          </Button>
        </div>

        {/* Mobile-focused Card Container */}
        <div className="mx-auto w-full max-w-sm xl:max-w-md relative z-10 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl md:bg-transparent md:backdrop-blur-none md:dark:bg-transparent border border-white/40 dark:border-slate-800/60 md:border-transparent rounded-[2rem] md:rounded-none p-6 sm:p-8 md:p-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] md:shadow-none transition-all">
          <div className="mb-8 md:mb-10 text-center md:text-left">
            <div className="md:hidden flex justify-center mb-6">
              <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-600/30">
                <img src={logo} alt="Logo" className="h-10 w-10 mix-blend-screen" />
              </div>
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-2" style={{ fontFamily: 'Poppins, ui-sans-serif, system-ui, -apple-system, Arial' }}>
              Welcome <span className="text-blue-600">Back</span>
            </h2>
            <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">Enter your details to access your account.</p>
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-slate-100/80 dark:bg-slate-950/80 p-1.5 mb-8 md:mb-10 shadow-inner">
              <TabsTrigger value="signin" className="rounded-xl h-11 text-sm font-bold data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-blue-600 dark:data-[state=active]:text-white transition-all">
                Sign In
              </TabsTrigger>
              <TabsTrigger value="signup" className="rounded-xl h-11 text-sm font-bold data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md dark:data-[state=active]:bg-blue-600 dark:data-[state=active]:text-white transition-all">
                Sign Up
              </TabsTrigger>
            </TabsList>
            
            {/* --- SIGN IN --- */}
            <TabsContent value="signin" className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-0">
              <form onSubmit={handleSignIn} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="signin-email" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Email Address
                  </label>
                  <div className="relative group">
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="name@example.com"
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      required
                      className="pl-11 h-12 border-slate-200 dark:border-slate-800 focus:border-blue-600 focus:ring-blue-600/20 bg-slate-50 hover:bg-white dark:bg-slate-900 dark:hover:bg-slate-900/80 transition-colors rounded-xl text-slate-900 dark:text-white"
                    />
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="signin-password" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Password
                    </label>
                    <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                      <DialogTrigger asChild>
                        <button type="button" className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
                          Forgot password?
                        </button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md bg-white border-slate-200 shadow-2xl dark:bg-slate-950 dark:border-slate-800 rounded-2xl">
                        <DialogHeader>
                          <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Lock className="w-5 h-5 text-blue-600" />
                            Reset Password
                          </DialogTitle>
                          <DialogDescription className="text-slate-500 dark:text-slate-400 pt-2">
                            Enter your account email and we'll send you a recovery link.
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleForgotPassword} className="space-y-5 mt-2">
                          <div className="space-y-2">
                            <label htmlFor="reset-email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              Email Address
                            </label>
                            <div className="relative group">
                              <Input
                                id="reset-email"
                                type="email"
                                placeholder="name@example.com"
                                value={resetEmail}
                                onChange={(e) => setResetEmail(e.target.value)}
                                required
                                className="pl-11 h-12 border-slate-200 dark:border-slate-800 focus:border-blue-500 transition-all rounded-xl"
                              />
                              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600" />
                            </div>
                          </div>
                          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" className="h-11 rounded-xl sm:w-28 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800" onClick={() => setIsResetDialogOpen(false)}>
                              Cancel
                            </Button>
                            <Button type="submit" className="h-11 rounded-xl sm:w-36 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-600/20">
                              Send Link
                            </Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="relative group">
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      required
                      className="pl-11 h-12 border-slate-200 dark:border-slate-800 focus:border-blue-600 focus:ring-blue-600/20 bg-slate-50 hover:bg-white dark:bg-slate-900 dark:hover:bg-slate-900/80 transition-colors rounded-xl text-slate-900 dark:text-white"
                    />
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  </div>
                </div>

                <Button 
                  type="submit"
                  disabled={isSigningIn}
                  className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-xl font-bold shadow-lg shadow-blue-600/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  {isSigningIn ? "Signing In..." : "Sign In"}
                </Button>
                
                {showWakingMessage && (
                  <div className="text-center text-sm font-medium text-amber-600 dark:text-amber-500 animate-pulse mt-4 bg-amber-50 dark:bg-amber-500/10 py-2 rounded-lg border border-amber-200 dark:border-amber-500/20">
                    Connecting to server... Please wait a moment.
                  </div>
                )}
              </form>
            </TabsContent>
            
            {/* --- SIGN UP --- */}
            <TabsContent value="signup" className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-0">
              <form onSubmit={handleSignUp} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="signup-name" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Full Name
                  </label>
                  <div className="relative group">
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="John Doe"
                      value={signUpName}
                      onChange={(e) => setSignUpName(e.target.value)}
                      required
                      className="pl-11 h-12 border-slate-200 dark:border-slate-800 focus:border-blue-600 focus:ring-blue-600/20 bg-slate-50 hover:bg-white dark:bg-slate-900 dark:hover:bg-slate-900/80 transition-colors rounded-xl text-slate-900 dark:text-white"
                    />
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="signup-phone" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Phone Number
                  </label>
                  <div className="relative group">
                    <Input
                      id="signup-phone"
                      type="tel"
                      placeholder="08000000000"
                      value={signUpPhone}
                      onChange={(e) => setSignUpPhone(e.target.value)}
                      required
                      className="pl-11 h-12 border-slate-200 dark:border-slate-800 focus:border-blue-600 focus:ring-blue-600/20 bg-slate-50 hover:bg-white dark:bg-slate-900 dark:hover:bg-slate-900/80 transition-colors rounded-xl text-slate-900 dark:text-white"
                    />
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="signup-email" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Email Address
                  </label>
                  <div className="relative group">
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="name@example.com"
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      required
                      className="pl-11 h-12 border-slate-200 dark:border-slate-800 focus:border-blue-600 focus:ring-blue-600/20 bg-slate-50 hover:bg-white dark:bg-slate-900 dark:hover:bg-slate-900/80 transition-colors rounded-xl text-slate-900 dark:text-white"
                    />
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="signup-password" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <div className="relative group">
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="Minimum 6 characters"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      required
                      className="pl-11 h-12 border-slate-200 dark:border-slate-800 focus:border-blue-600 focus:ring-blue-600/20 bg-slate-50 hover:bg-white dark:bg-slate-900 dark:hover:bg-slate-900/80 transition-colors rounded-xl text-slate-900 dark:text-white"
                    />
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="signup-confirm-password" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Confirm Password
                  </label>
                  <div className="relative group">
                    <Input
                      id="signup-confirm-password"
                      type="password"
                      placeholder="Repeat password"
                      value={signUpConfirmPassword}
                      onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                      required
                      className="pl-11 h-12 border-slate-200 dark:border-slate-800 focus:border-blue-600 focus:ring-blue-600/20 bg-slate-50 hover:bg-white dark:bg-slate-900 dark:hover:bg-slate-900/80 transition-colors rounded-xl text-slate-900 dark:text-white"
                    />
                    <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  </div>
                </div>

                <div className="pt-2">
                  <Button 
                    type="submit"
                    disabled={isSigningUp}
                    className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 h-12 rounded-xl font-bold shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    {isSigningUp ? "Creating Account..." : "Create Account"}
                  </Button>
                </div>
                
                {showWakingMessage && (
                  <div className="text-center text-sm font-medium text-amber-600 dark:text-amber-500 animate-pulse mt-4 bg-amber-50 dark:bg-amber-500/10 py-2 rounded-lg border border-amber-200 dark:border-amber-500/20">
                    Connecting to server... Please wait a moment.
                  </div>
                )}
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Auth;
