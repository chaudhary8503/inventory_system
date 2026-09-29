import './App.css';
import Header from './components/Header';
import Inventory from './pages/Inventory';

function App() {
  return (
    <div className="app-shell">
      <Header />

      <main className="app-body">
        <div className="page">
          <div className="page-inner">
            <Inventory />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
