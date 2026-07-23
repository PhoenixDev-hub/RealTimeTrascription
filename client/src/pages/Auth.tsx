import Cadastro from '../components/Auth/Cadastro';
import Login from '../components/Auth/Login';

interface AuthProps {
  mode: 'login' | 'cadastro';
}

export default function Auth({ mode }: AuthProps) {
  return mode === 'login' ? <Login /> : <Cadastro />;
}
