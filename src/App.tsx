// 画面の行き先。ログイン → メール確認 → 店舗づくり → 本体（AI経理の App.tsx と同じ順）
import { useState } from "react";
import { Navigate, Route, Routes, useMatch } from "react-router-dom";
import { useSession } from "./hooks/useSession";
import { useBranding } from "./hooks/useBranding";
import { readInvite } from "./lib/invite";
import { loadCurrentOrg, saveCurrentOrg } from "./lib/currentOrg";
import { OrgProvider } from "./contexts/OrgContext";
import { Layout } from "./components/common/Layout";
import { LoginPage } from "./pages/LoginPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { InvitePage } from "./pages/InvitePage";
import { RecipesPage } from "./pages/RecipesPage";
import { RecipeDetailPage } from "./pages/RecipeDetailPage";
import { RecipeEditPage } from "./pages/RecipeEditPage";
import { WorkModePage } from "./pages/WorkModePage";
import { LabelPage } from "./pages/LabelPage";
import { IngredientsPage } from "./pages/IngredientsPage";
import { ProductsPage } from "./pages/ProductsPage";
import { ImportPage } from "./pages/ImportPage";
import { ImportPreviewPage } from "./pages/ImportPreviewPage";
import { CreditsPage } from "./pages/CreditsPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  const s = useSession();
  const inviting = useMatch("/invite/:orgId/:token");
  const orgIds = Object.keys(s.orgs);
  // いま開いている店舗。前回選んだ店舗を覚えておき、所属が外れていたら最初の店舗にする
  const [picked, setPicked] = useState<string | null>(loadCurrentOrg);
  const current = picked && picked in s.orgs ? picked : orgIds[0] ?? null;
  const select = (id: string) => {
    saveCurrentOrg(id);
    setPicked(id);
  };

  if (s.loading) return <p className="p-10 text-center text-muted">読み込み中…</p>;
  // 招待リンクはログイン前でも開ける（ログイン・確認・参加の案内はこの画面の中で行う）
  if (inviting) return <Routes><Route path="/invite/:orgId/:token" element={<InvitePage session={s} onJoined={select} />} /></Routes>;
  if (!s.user) return <LoginPage />;
  if (s.user.needsVerify) return <VerifyEmailPage email={s.user.email} />;
  // 招待の途中でログインしてきた人は、店舗を作る前に参加画面へ戻す
  const pending = readInvite();
  if (pending) return <Navigate to={`/invite/${pending}`} replace />;
  if (!current) return <OnboardingPage onCreated={select} />;

  return (
    <OrgProvider orgId={current} uid={s.user.uid} email={s.user.email} orgs={s.orgs} select={select}>
      <Main orgId={current} onCreated={select} />
    </OrgProvider>
  );
}

function Main({ orgId, onCreated }: { orgId: string; onCreated: (id: string) => void }) {
  const brand = useBranding(orgId);
  return (
    <Routes>
      {/* 作業モードとラベル印刷は、下の入口や見出しを出さない（画面いっぱいに使う） */}
      <Route path="/recipes/:id/work" element={<WorkModePage />} />
      <Route path="/recipes/:id/label" element={<LabelPage />} />
      <Route path="/new-store" element={<OnboardingPage onCreated={onCreated} canGoBack />} />
      <Route path="*" element={
        <Layout brand={brand}>
          <Routes>
            <Route path="/" element={<RecipesPage />} />
            <Route path="/recipes/new" element={<RecipeEditPage />} />
            <Route path="/recipes/:id" element={<RecipeDetailPage />} />
            <Route path="/recipes/:id/edit" element={<RecipeEditPage />} />
            <Route path="/ingredients" element={<IngredientsPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/import/:importId" element={<ImportPreviewPage />} />
            <Route path="/credits" element={<CreditsPage />} />
            <Route path="/settings" element={<SettingsPage brand={brand} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  );
}
