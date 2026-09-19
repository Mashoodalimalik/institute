'use client';
// /app/students/page.tsx — redirect to dashboard (students are managed there)
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StudentsPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard'); }, [router]);
  return null;
}
