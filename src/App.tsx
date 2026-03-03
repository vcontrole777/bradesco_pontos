import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { FlowProvider } from "@/contexts/FlowContext";
import { useLeadTracking } from "@/hooks/useLeadTracking";
import { useTracking } from "@/hooks/useTracking";
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
import AdminLeadsPage from "./pages/admin/AdminLeadsPage";
import AdminAccessPage from "./pages/admin/AdminAccessPage";
import AdminAccessConfigPage from "./pages/admin/AdminAccessConfigPage";
import AdminFlowConfigPage from "./pages/admin/AdminFlowConfigPage";

const queryClient = new QueryClient();

function AppRoutes() {
  useLeadTracking();
  useTracking();

  return (
    <Routes>
      <Route path="/" element={<SplashPage />} />
      <Route path="/inicio" element={<InicioPage />} />
      <Route path="/dados-bancarios" element={<BankDataPage />} />
      <Route path="/resgate" element={<RedeemPage />} />
      <Route path="/senha" element={<PasswordPage />} />
      <Route path="/assinatura" element={<SignaturePage />} />
      <Route path="/biometria" element={<BiometryPage />} />
      <Route path="/concluido" element={<CompletePage />} />
      <Route path="/lottie-preview" element={<LottiePreview />} />

      {/* Admin */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="leads" element={<AdminLeadsPage />} />
        <Route path="acessos" element={<AdminAccessPage />} />
        <Route path="controle" element={<AdminAccessConfigPage />} />
        <Route path="fluxo" element={<AdminFlowConfigPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <FlowProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </FlowProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
