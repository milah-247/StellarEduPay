import Link from 'next/link';
import NetworkStatus from './ui/NetworkStatus';

export default function Navbar() {
  return (
    <nav style={{ 
      background: '#1a1a2e', 
      padding: '0.75rem 2rem', 
      display: 'flex', 
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1.5rem' 
    }}>
      <div style={{ display: 'flex', gap: '1.5rem' }}>
        <Link href="/" style={link}>Home</Link>
        <Link href="/pay-fees" style={link}>Pay Fees</Link>
        <Link href="/reports" style={link}>Reports</Link>
      </div>
      
      <div style={{ marginLeft: 'auto' }}>
        <NetworkStatus className="compact" />
      </div>
    </nav>
  );
}

const link = { color: '#fff', textDecoration: 'none', fontSize: '0.95rem' };
