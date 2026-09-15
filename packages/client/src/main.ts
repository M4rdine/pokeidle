import { loadRegistry } from '@pokeidle/shared'
import './styles/tokens.css'

loadRegistry()
document.querySelector('#app')!.textContent = 'Pokeidle'
