import Link from 'next/link';
const nav = [
 ['Dashboard','/'],['Customers','/customers'],['Properties','/properties'],['Work Orders','/work-orders'],['Schedule','/schedule'],['Routes','/routes'],['Recurring','/recurring'],['Technician','/technician'],['Estimates','/estimates'],['Invoices','/invoices'],['Customer Portal','/portal'],['Reports','/reports'],['AI Assistant','/ai-assistant'],['Equipment','/equipment'],['Commercial','/commercial'],['Performance','/performance'],['Alerts','/alerts'],['Employees','/employees'],['Settings','/settings']
];
export default function Layout({children}:{children:React.ReactNode}){return <div className="app"><aside className="sidebar"><div className="brand">Bakersss OS</div><div className="tag">Property Maintenance Operations</div><nav className="nav">{nav.map(([n,h])=><Link key={h} href={h}>{n}</Link>)}</nav></aside><main className="main">{children}</main></div>}
