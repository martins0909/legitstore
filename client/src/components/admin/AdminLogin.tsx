import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Lock } from "lucide-react";
import { useState } from "react";

import { apiFetch } from "@/lib/api";
import logo from "@/assets/imagebackground.png";

type Props = {
  onLogin: (token: string) => void;
};

const AdminLogin = ({ onLogin }: Props) => {
  const [email, setEmail] = useState("admin@local");
  const [password, setPassword] = useState("adminpass");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }) as { token: string };
      onLogin(data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto relative">
      {/* Subtle decorative glows */}
      <div className="absolute -top-8 -left-8 w-32 h-32 bg-gradient-to-br from-blue-400/30 to-purple-400/30 rounded-full blur-3xl" />
      <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-gradient-to-br from-purple-400/30 to-pink-400/30 rounded-full blur-3xl" />

      <Card className="relative bg-white/95 backdrop-blur-xl shadow-2xl border-2 border-white/60 overflow-hidden dark:bg-gray-900/95 dark:border-gray-800">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-transparent to-purple-50/50 dark:from-blue-950/30 dark:via-transparent dark:to-purple-950/30 pointer-events-none" />
        <CardHeader className="relative text-center space-y-3 pb-4">
          <div className="inline-flex items-center justify-center mx-auto">
            <img
              src={logo}
              alt="Legit Store Logo"
              className="h-16 w-auto drop-shadow-xl transition-transform duration-300 hover:scale-105"
            />
          </div>
          <CardTitle
            className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400"
            style={{ fontFamily: 'Poppins, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' }}
          >
            Admin Sign In
          </CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-400">Access the admin dashboard</CardDescription>
          {error && (
            <div className="text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 dark:text-red-400 dark:bg-red-950 dark:border-red-900">
              {error}
            </div>
          )}
        </CardHeader>

        <CardContent className="relative">
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="admin-email" className="text-gray-700 dark:text-gray-300 font-medium flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600" /> Email
              </Label>
              <div className="relative group">
                <Input
                  id="admin-email"
                  type="email"
                  placeholder="admin@local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-11 h-12 border-2 border-gray-200 focus:border-blue-500 transition-all duration-300 rounded-xl bg-white/80 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-password" className="text-gray-700 dark:text-gray-300 font-medium flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-600" /> Password
              </Label>
              <div className="relative group">
                <Input
                  id="admin-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-11 h-12 border-2 border-gray-200 focus:border-blue-500 transition-all duration-300 rounded-xl bg-white/80 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={loading}
                aria-label="Sign in"
                className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]"
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
