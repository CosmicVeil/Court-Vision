import { Outlet } from 'react-router-dom';
import SiteHeader from './SiteHeader';

// Layout route: draws what every page shares, then the matched page in <Outlet />.
export default function AppShell() {
  return (
    <>
      <SiteHeader />
      <Outlet />
    </>
  );
}
