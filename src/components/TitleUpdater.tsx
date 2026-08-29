"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function TitleUpdater() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) {
      const segments = pathname.split('/').filter(Boolean);
      let pageName = 'Home';
      
      if (segments.length > 0) {
        let lastSegment = segments[segments.length - 1];
        
        // Handle specific naming for better clarity
        if (lastSegment === 'add' && segments.length > 1) {
          pageName = `Add ${segments[segments.length - 2]}`;
        } else if (lastSegment === 'admin' && segments.includes('login')) {
          pageName = 'Admin Login';
        } else if (lastSegment === 'employee' && segments.includes('login')) {
          pageName = 'Employee Login';
        } else if (lastSegment.startsWith('[') && segments.length > 1) {
          // If it's a dynamic route like [id], use the parent segment
          pageName = segments[segments.length - 2] + ' Details';
        } else {
          pageName = lastSegment.replace(/-/g, ' ');
        }
        
        // Capitalize words
        pageName = pageName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      
      document.title = `${pageName.trim()} | makewithus`;
    }
  }, [pathname]);

  return null;
}
