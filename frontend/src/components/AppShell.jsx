import { useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import BackToTop from './BackToTop';
import SiteHeader from './SiteHeader';
import { shouldResetScroll } from '../utils/scroll';

// Layout route: draws what every page shares, then the matched page in <Outlet />.
export default function AppShell() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const previousPathRef = useRef(pathname);

  // BrowserRouter keeps the old scroll position across routes, so a new page would open
  // wherever the last one was scrolled to. Jump (not glide) to the top before paint.
  useLayoutEffect(() => {
    if (shouldResetScroll(navigationType, previousPathRef.current, pathname)) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    previousPathRef.current = pathname;
  }, [pathname, navigationType]);

  return (
    <>
      <SiteHeader />
      <Outlet />
      <BackToTop />
    </>
  );
}
