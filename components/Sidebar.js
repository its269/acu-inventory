"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DataCache } from "@/lib/data-cache";
import "@/styles/sidebar.css";
import SyncModal from "./SyncModal";

/* ── SVG Icons ─────────────────────────────────────────── */
const IconInventory = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
  </svg>
);

const IconStock = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M7 7h10" /><path d="M7 12h10" /><path d="M7 17h10" />
  </svg>
);

const IconPO = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
  </svg>
);

const IconSales = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" />
  </svg>
);

export default function Sidebar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [userName, setUserName] = useState("Admin User");
  const [showSyncModal, setShowSyncModal] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => setMounted(true));
  }, []);

  useEffect(() => {
    // We use useEffect here because localStorage is only available on the client.
    // To satisfy the strict "no-setState-in-effect" lint rule, we could use an async wrapper
    // or simply accept the initial render and update once client-side.
    const stored = localStorage.getItem("userName");
    if (stored) {
      // Use a microtask to avoid synchronous state update in effect body
      Promise.resolve().then(() => setUserName(stored));
    }
  }, []);

  const navItems = [
    { name: "Inventory", href: "/dashboard", icon: <IconInventory /> },
    { name: "Stock Items", href: "/stock-items", icon: <IconStock /> },
    { name: "Incoming PO", href: "/po", icon: <IconPO /> },
    { name: "Last 3 Months Sales", href: "/sales", icon: <IconSales /> },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <span className="sidebar-logo">
            {/* <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg> */}
            <img src="/KELIN LOGO-01.png" alt="KGS Logo" style={{ width: '38px', marginLeft: '4px' }} />
          </span>
          KGS PURCHASING
        </div>
        <div className="sidebar-user-header">
          <span className="sidebar-user-name">{userName}</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={`sidebar-item ${mounted && pathname === item.href ? "active" : ""}`}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            {item.name}
          </Link>
        ))}

        <div style={{ margin: '1.5rem 0.75rem 0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem' }}>
          <button
            className="sidebar-item"
            style={{ width: '100%', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.2)' }}
            onClick={() => setShowSyncModal(true)}
          >
            <span className="sidebar-item-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
            </span>
            Sync Data
          </button>
        </div>
      </nav>

      <SyncModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        onSyncComplete={() => {
          DataCache.clear();
          window.location.reload();
        }}
      />

      <div className="sidebar-footer">
        <button
          className="sidebar-logout"
          onClick={() => {
            // Clear user info
            localStorage.removeItem("userName");
            localStorage.removeItem("userFirstName");
            localStorage.removeItem("userLastName");

            // Clear filter persistence
            Object.keys(localStorage)
              .filter(k => k.includes("_filter_"))
              .forEach(k => localStorage.removeItem(k));

            DataCache.clear();
            // Navigate directly — the logout route clears the cookie and
            // redirects to /signin in a single server response.
            window.location.href = "/api/auth/logout";
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </button>
      </div>
    </aside>
  );
}
