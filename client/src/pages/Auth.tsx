import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Mail, Lock, User, ArrowRight, Shield } from "lucide-react";
import { apiFetch, catalogAPI, catalogCategoriesAPI, warmBackend } from "@/lib/api";
import logo from "@/assets/imagebackground.png";
import heroBackground from "@/assets/navbarbanner.jfif";

const Auth = () => {
  const navigate = useNavigate();
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
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
    
    if (!signUpEmail || !signUpPassword || !signUpConfirmPassword) {
      toast.error("Please fill in all fields");
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
        body: JSON.stringify({ email: signUpEmail, password: signUpPassword }),
      }) as { ok: boolean; user: { id: string; email: string; name?: string; balance: number } };

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
    <div className="relative min-h-screen overflow-hidden px-6 py-12 transition-colors duration-300">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroBackground})` }}
      />
      <div className="absolute inset-0 bg-blue-950/62 mix-blend-multiply" />
      <div className="absolute inset-0 bg-gradient-to-b from-blue-950/28 via-blue-900/18 to-blue-950/26" />
      <div className="absolute top-0 left-0 h-96 w-96 rounded-full bg-gradient-to-br from-blue-400/20 to-purple-400/20 blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-gradient-to-br from-purple-400/20 to-pink-400/20 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 transform rounded-full bg-gradient-to-br from-pink-400/15 to-blue-400/15 blur-3xl animate-pulse" style={{ animationDelay: '0.5s' }} />

      <div className="relative z-10 flex min-h-[calc(100vh-6rem)] items-center justify-center">
      
      <div className="w-full max-w-md relative z-10">
        {/* Header with logo */}
        <div className="text-center mb-8 animate-in fade-in slide-in-from-top duration-500">
          <div className="inline-flex items-center justify-center mb-4">
            <img 
              src={logo} 
              alt="Legit Store" 
              className="h-20 w-auto drop-shadow-2xl"
            />
          </div>
          <h1 
            className="mb-3 text-4xl font-bold text-white drop-shadow-2xl md:text-5xl"
            style={{ fontFamily: 'Poppins, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}
          >
            Welcome
          </h1>
          <p className="text-lg text-blue-50">Your trusted marketplace for authentic accounts</p>
        </div>

        <Tabs defaultValue="signin" className="w-full animate-in fade-in slide-in-from-bottom duration-700">
          <TabsList className="grid w-full grid-cols-2 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-lg p-1 h-12">
            <TabsTrigger 
              value="signin" 
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-300 font-medium dark:text-gray-300"
            >
              <User className="w-4 h-4 mr-2" />
              Sign In
            </TabsTrigger>
            <TabsTrigger 
              value="signup" 
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-300 font-medium dark:text-gray-300"
            >
              <Mail className="w-4 h-4 mr-2" />
              Sign Up
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="signin" className="mt-6">
            <Card className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl shadow-2xl border-white/60 dark:border-gray-800 border-2 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-transparent to-purple-50/50 dark:from-blue-950/30 dark:to-purple-950/30 pointer-events-none"></div>
              <CardHeader className="relative space-y-1 pb-6">
                <CardTitle className="text-2xl font-bold text-blue-700 dark:text-blue-400">Sign In</CardTitle>
                <CardDescription className="text-gray-600 dark:text-gray-400">Enter your credentials to access your account</CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <form onSubmit={handleSignIn} className="space-y-5">
                  <div className="space-y-2">
                    <label htmlFor="signin-email" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-blue-600" />
                      Email
                    </label>
                    <div className="relative group">
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="your@email.com"
                        value={signInEmail}
                        onChange={(e) => setSignInEmail(e.target.value)}
                        required
                        className="pl-11 h-12 border-2 border-gray-200 dark:border-gray-700 focus:border-blue-500 transition-all duration-300 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-900 dark:text-gray-100"
                      />
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="signin-password" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-blue-600" />
                      Password
                    </label>
                    <div className="relative group">
                      <Input
                        id="signin-password"
                        type="password"
                        placeholder="••••••••"
                        value={signInPassword}
                        onChange={(e) => setSignInPassword(e.target.value)}
                        required
                        className="pl-11 h-12 border-2 border-gray-200 dark:border-gray-700 focus:border-blue-500 transition-all duration-300 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-900 dark:text-gray-100"
                      />
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                    </div>
                  </div>
                  <Button 
                    type="submit"
                    disabled={isSigningIn}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]"
                  >
                    <span className="flex items-center justify-center gap-2">
                      {isSigningIn ? "Signing In..." : "Sign In"}
                      {!isSigningIn && <ArrowRight className="w-4 h-4" />}
                    </span>
                  </Button>
                  
                  {showWakingMessage && (
                    <div className="text-center text-sm text-blue-600 dark:text-blue-400 animate-pulse">
                      Waking server... This takes a moment after inactivity
                    </div>
                  )}
                  
                  <div className="text-center pt-2">
                    <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="link" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
                          Forgot Password?
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-white/95 backdrop-blur-xl border-2 border-white/60 shadow-2xl dark:bg-gray-900/95 dark:border-gray-800">
                        <DialogHeader>
                          <DialogTitle className="text-2xl font-bold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                            <Mail className="w-5 h-5 text-blue-600" />
                            Reset Your Password
                          </DialogTitle>
                          <DialogDescription className="text-gray-600 dark:text-gray-400">
                            Enter your email address and we'll send you a link to reset your password.
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleForgotPassword} className="space-y-5 mt-4">
                          <div className="space-y-2">
                            <label htmlFor="reset-email" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                              <Mail className="w-4 h-4 text-blue-600" />
                              Email Address
                            </label>
                            <div className="relative group">
                              <Input
                                id="reset-email"
                                type="email"
                                placeholder="your@email.com"
                                value={resetEmail}
                                onChange={(e) => setResetEmail(e.target.value)}
                                required
                                className="pl-11 h-12 border-2 border-gray-200 focus:border-blue-500 transition-all duration-300 rounded-xl bg-white/80 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-100 dark:placeholder:text-gray-500"
                              />
                              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              className="flex-1 h-11 rounded-xl border-2 hover:bg-gray-50 transition-all duration-300"
                              onClick={() => setIsResetDialogOpen(false)}
                            >
                              Cancel
                            </Button>
                            <Button 
                              type="submit" 
                              className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                            >
                              Send Reset Link
                            </Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="signup" className="mt-6">
            <Card className="bg-white/95 backdrop-blur-xl shadow-2xl border-white/60 border-2 overflow-hidden dark:bg-gray-900/95 dark:border-gray-800">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-50/50 via-transparent to-pink-50/50 dark:from-purple-950/30 dark:via-transparent dark:to-pink-950/30 pointer-events-none"></div>
              <CardHeader className="relative space-y-1 pb-6">
                <CardTitle className="text-2xl font-bold text-blue-700 dark:text-blue-400">Create Account</CardTitle>
                <CardDescription className="text-gray-600 dark:text-gray-400">Sign up to start your shopping journey</CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <form onSubmit={handleSignUp} className="space-y-5">
                  <div className="space-y-2">
                    <label htmlFor="signup-email" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-600" />
                      Email
                    </label>
                    <div className="relative group">
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="your@email.com"
                        value={signUpEmail}
                        onChange={(e) => setSignUpEmail(e.target.value)}
                        required
                        className="pl-11 h-12 border-2 border-gray-200 focus:border-blue-500 transition-all duration-300 rounded-xl bg-white/80 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-100 dark:placeholder:text-gray-500"
                      />
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="signup-password" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-blue-600" />
                      Password
                    </label>
                    <div className="relative group">
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="••••••••"
                        value={signUpPassword}
                        onChange={(e) => setSignUpPassword(e.target.value)}
                        required
                        className="pl-11 h-12 border-2 border-gray-200 focus:border-blue-500 transition-all duration-300 rounded-xl bg-white/80 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-100 dark:placeholder:text-gray-500"
                      />
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="signup-confirm-password" className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-blue-600" />
                      Confirm Password
                    </label>
                    <div className="relative group">
                      <Input
                        id="signup-confirm-password"
                        type="password"
                        placeholder="••••••••"
                        value={signUpConfirmPassword}
                        onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                        required
                        className="pl-11 h-12 border-2 border-gray-200 focus:border-blue-500 transition-all duration-300 rounded-xl bg-white/80 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-100 dark:placeholder:text-gray-500"
                      />
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                    </div>
                  </div>
                  <Button 
                    type="submit"
                    disabled={isSigningUp}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]"
                  >
                    <span className="flex items-center justify-center gap-2">
                      {isSigningUp ? "Creating Account..." : "Create Account"}
                      {!isSigningUp && <ArrowRight className="w-4 h-4" />}
                    </span>
                  </Button>
                  
                  {showWakingMessage && (
                    <div className="text-center text-sm text-blue-600 dark:text-blue-400 animate-pulse">
                      Waking server... This takes a moment after inactivity
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="text-center mt-6">
          <Button variant="ghost" onClick={() => navigate("/")}>
            Back to Home
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Auth;
