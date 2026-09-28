import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { lazy, Suspense, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { setUiLang } from './lib/i18n';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Home from './pages/Home';
import Subject from './pages/Subject';
import Practice from './pages/Practice';
import Vocabulary from './pages/Vocabulary';
import Flashcards from './pages/Flashcards';
import Takeaways from './pages/Takeaways';

const AdminHome = lazy(() => import('./pages/admin/AdminHome'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminSubject = lazy(() => import('./pages/admin/AdminSubject'));
const AdminStudents = lazy(() => import('./pages/admin/AdminStudents'));
const AdminStudent = lazy(() => import('./pages/admin/AdminStudent'));

function Gate() {
  const { user, role, profile } = useAuth();
  const { i18n } = useTranslation();

  // Apply the language saved on the profile (e.g. when switching devices).
  useEffect(() => {
    if (profile?.uiLang && profile.uiLang !== i18n.language) setUiLang(profile.uiLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uiLang]);

  if (user === undefined) return <Spinner />;
  if (!user || !role) return <Login />;

  return (
    <Suspense fallback={<Spinner />}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="w/:weekId/s/:subjectId" element={<Subject />} />
        <Route path="w/:weekId/s/:subjectId/oefenen" element={<Practice />} />
        <Route path="w/:weekId/s/:subjectId/kernpunten/:topicId/:subtopicId?" element={<Takeaways />} />
        <Route path="woorden" element={<Vocabulary />} />
        <Route path="kaartjes" element={<Flashcards />} />
        {role === 'admin' && (
          <>
            <Route path="beheer" element={<AdminHome />} />
            <Route path="beheer/gebruikers" element={<AdminUsers />} />
            <Route path="beheer/leerlingen" element={<AdminStudents />} />
            <Route path="beheer/leerlingen/:uid" element={<AdminStudent />} />
            <Route path="beheer/w/:weekId/s/:subjectId" element={<AdminSubject />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  );
}
