import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export default function SchedulingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to dispatches page
    navigate('/dispatches', { replace: true });
  }, [navigate]);

  return null;
}
