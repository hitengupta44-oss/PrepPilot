'use client';
import { useEffect, useState } from 'react';

export default function Toast() {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      const { message, ms } = (e as CustomEvent).detail;
      setMsg(message);
      setShow(true);
      clearTimeout(t);
      t = setTimeout(() => setShow(false), ms);
    };
    window.addEventListener('pp-toast', on);
    return () => window.removeEventListener('pp-toast', on);
  }, []);
  return <div id="toast" className={show ? 'show' : ''}>{msg}</div>;
}
