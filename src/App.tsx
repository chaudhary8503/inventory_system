import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import { getMyLengthUnit, getSettings, listItems, listLocations, myStockLocations, type Item, type Location } from './api';
import { canOpenModule, loadSessionUser, signOut, type SessionUser } from './auth';
import { Banner, Loading, NoAccess } from './components/Common';
import ErrorBoundary from './components/ErrorBoundary';
import Header, { type NavEntry } from './components/Header';
import { MODULE, PORTAL_URL } from './config';
import { supabase } from './lib/supabase';
import AdjustPage from './pages/AdjustPage';
import BundlePage from './pages/BundlePage';
import BundlesPage from './pages/BundlesPage';
import ItemPage from './pages/ItemPage';
import ItemsPage from './pages/ItemsPage';
import LocationsPage from './pages/LocationsPage';
import LoginPage from './pages/LoginPage';
import MovementsPage from './pages/MovementsPage';
import OpeningPage from './pages/OpeningPage';
import SettingsPage from './pages/SettingsPage';
import SpecsPage from './pages/SpecsPage';
import StockPage from './pages/StockPage';
import TransferPage from './pages/TransferPage';
import ChallanPage from './pages/ChallanPage';
import ChallansPage from './pages/ChallansPage';
import ImportPage from './pages/ImportPage';
import MinimumsPage from './pages/MinimumsPage';
import { setLengthUnit, type LengthUnit } from './format';
import TrendsPage from './pages/TrendsPage';
import ValuationPage from './pages/ValuationPage';
import { useRoute } from './router';
import { makeCan, type Session } from './session';

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessionUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setUser(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <LoginPage title="Inventory" onSuccess={setUser} />;

  if (!canOpenModule(user, MODULE)) {
    return (
      <div className="login-shell">
        <div className="card login-card">
          <h1 className="page-title">No access</h1>
          <p className="page-sub">You don't have access to this module. Ask the owner.</p>
          <div className="form-actions">
            <a className="btn btn-secondary" href={PORTAL_URL}>
              ← Back to the Portal
            </a>
            <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <InventoryApp user={user} />;
}

function InventoryApp({ user }: { user: SessionUser }) {
  const route = useRoute();
  const can = useMemo(() => makeCan(user), [user]);
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [stockLocationIds, setStockLocationIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lengthUnit, setUnit] = useState<LengthUnit>('ft');
  const [reasons, setReasons] = useState<string[]>([]);

  const reloadCatalog = useCallback(async () => {
    try {
      const [i, l, mine, unit, settings] = await Promise.all([
        listItems(true),
        listLocations(),
        user.isOwner ? Promise.resolve<string[] | null>(null) : myStockLocations(user.profile.user_id),
        getMyLengthUnit(),
        getSettings().catch(() => null),
      ]);
      // Feet / metres is the person's own setting (Portal); set before anything renders.
      setLengthUnit(unit);
      setUnit(unit);
      setReasons(settings?.adjustment_reasons ?? []);
      setItems(i);
      setLocations(l);
      setStockLocationIds(mine ?? l.map((x) => x.location_id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReady(true);
    }
  }, [user]);

  // Loads items and locations from the database (an external system); state is set after the await.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void reloadCatalog();
  }, [reloadCatalog]);

  const session: Session = { user, can, items, locations, stockLocationIds, reloadCatalog, lengthUnit, adjustmentReasons: reasons };

  const nav: NavEntry[] = [
    { key: 'stock', label: 'Stock', allowed: can('view_stock') },
    { key: 'bundles', label: 'Bundles', allowed: can('view_bundles') },
    { key: 'movements', label: 'Movements', allowed: can('view_movements') },
    { key: 'adjust', label: 'Adjust', allowed: can('adjust_stock') },
    { key: 'transfer', label: 'Transfer', allowed: can('record_transfer') },
    { key: 'challans', label: 'Challans', allowed: can('record_transfer') || can('view_movements') },
    { key: 'opening', label: 'Opening stock', allowed: can('record_opening_stock') },
    { key: 'trends', label: 'Trends', allowed: can('view_trends') },
    { key: 'value', label: 'Stock value', allowed: can('view_costs') },
    { key: 'items', label: 'Items', allowed: can('manage_items') || can('edit_standard_cost') },
    { key: 'specs', label: 'Spec lists', allowed: can('manage_items') },
    { key: 'import', label: 'Import', allowed: can('manage_items') },
    { key: 'minimums', label: 'Minimum levels', allowed: can('view_stock') || can('manage_items') },
    { key: 'locations', label: 'Locations', allowed: can('manage_locations') || user.isOwner },
    { key: 'settings', label: 'Settings', allowed: can('manage_settings') },
  ];
  const firstAllowed = nav.find((n) => n.allowed)?.key;
  const section = route.path[0] ?? firstAllowed ?? '';
  const allowed = (key: string) => nav.find((n) => n.key === key)?.allowed ?? false;
  const activeTab = section === 'item' ? 'stock' : section === 'bundle' ? 'bundles' : section === 'challan' ? 'challans' : section;

  let page;
  if (!ready) page = <Loading />;
  else if (error) page = <Banner kind="error">Couldn't load Inventory: {error}</Banner>;
  else {
    switch (section) {
      case 'stock':
        page = allowed('stock') ? <StockPage session={session} /> : <NoAccess />;
        break;
      case 'item':
        page = <ItemPage session={session} itemId={route.path[1]} focusLocation={route.query.get('location')} />;
        break;
      case 'bundles':
        page = allowed('bundles') ? <BundlesPage session={session} query={route.query} /> : <NoAccess />;
        break;
      case 'bundle':
        page = can('view_bundles') ? <BundlePage session={session} bundleId={route.path[1]} /> : <NoAccess />;
        break;
      case 'movements':
        page = allowed('movements') ? <MovementsPage session={session} movementId={route.path[1]} query={route.query} /> : <NoAccess />;
        break;
      case 'adjust':
        page = allowed('adjust') ? <AdjustPage session={session} query={route.query} /> : <NoAccess />;
        break;
      case 'transfer':
        page = allowed('transfer') ? <TransferPage session={session} query={route.query} /> : <NoAccess />;
        break;
      case 'challans':
        page = allowed('challans') ? <ChallansPage session={session} /> : <NoAccess />;
        break;
      case 'challan':
        page = allowed('challans') ? <ChallanPage challanId={route.path[1]} autoPrint={route.query.get('print') === '1'} /> : <NoAccess />;
        break;
      case 'import':
        page = allowed('import') ? <ImportPage session={session} /> : <NoAccess />;
        break;
      case 'minimums':
        page = allowed('minimums') ? <MinimumsPage session={session} focus={route.query.get('group')} /> : <NoAccess />;
        break;
      case 'opening':
        page = allowed('opening') ? <OpeningPage session={session} /> : <NoAccess />;
        break;
      case 'trends':
        page = allowed('trends') ? <TrendsPage session={session} /> : <NoAccess />;
        break;
      case 'value':
        page = allowed('value') ? <ValuationPage session={session} /> : <NoAccess />;
        break;
      case 'items':
        page = allowed('items') ? <ItemsPage session={session} editId={route.path[1]} /> : <NoAccess />;
        break;
      case 'specs':
        page = allowed('specs') ? <SpecsPage session={session} /> : <NoAccess />;
        break;
      case 'locations':
        page = allowed('locations') ? <LocationsPage session={session} /> : <NoAccess />;
        break;
      case 'settings':
        page = allowed('settings') ? <SettingsPage /> : <NoAccess />;
        break;
      default:
        page = <NoAccess />;
    }
  }

  return (
    <div className="app-shell">
      <Header session={session} nav={nav} active={activeTab} />
      <main className="app-body">
        <div className="page">
          <div className="page-inner">
            <ErrorBoundary resetKey={window.location.hash}>{page}</ErrorBoundary>
          </div>
        </div>
      </main>
    </div>
  );
}
