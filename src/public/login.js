const mensaje = document.getElementById('mensajeAuth');
const campoPassword = document.getElementById('password');
const botonEnviar = document.getElementById('btnSubmitText');
let esRegistro = false;

function cambiarTab(tipo) {
    esRegistro = (tipo === 'register');
    const nombreField = document.getElementById('nombreField');
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');

    mensaje.innerText = '';

    if (esRegistro) {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        nombreField.classList.remove('hidden');
        document.getElementById('nombre').setAttribute('required', 'true');
        campoPassword.setAttribute('minlength', '8');   // el servidor también lo exige
        campoPassword.setAttribute('maxlength', '72');
        botonEnviar.innerText = 'Registrar Cuenta';
    } else {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        nombreField.classList.add('hidden');
        document.getElementById('nombre').removeAttribute('required');
        campoPassword.removeAttribute('minlength');
        campoPassword.removeAttribute('maxlength');
        botonEnviar.innerText = 'Entrar al Sistema';
    }
}

document.getElementById('tabLogin').addEventListener('click', () => cambiarTab('login'));
document.getElementById('tabRegister').addEventListener('click', () => cambiarTab('register'));

// Aviso si llegó aquí porque su sesión terminó
if (new URLSearchParams(window.location.search).has('expirada')) {
    localStorage.removeItem('usuario_nombre');
    mensaje.style.color = '#b45309';
    mensaje.innerText = 'Tu sesión terminó. Inicia sesión de nuevo.';
    window.history.replaceState({}, '', '/');
}

const form = document.getElementById('authForm');
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = campoPassword.value;
    const nombre = document.getElementById('nombre').value;

    const url = esRegistro ? '/api/usuarios/register' : '/api/usuarios/login';
    const payload = esRegistro
        ? { nombre, email, password }
        : { email, password, dispositivo: 'web' };

    botonEnviar.disabled = true;   // evita envíos dobles (cada intento de login cuenta)
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok) {
            mensaje.style.color = '#16a34a';
            if (esRegistro) {
                cambiarTab('login');   // esta función borra el mensaje, por eso se escribe después
                mensaje.innerText = '¡Registro exitoso! Ahora inicia sesión.';
                campoPassword.value = '';
            } else {
                mensaje.innerText = '¡Bienvenido! Entrando al panel...';
                localStorage.setItem('usuario_nombre', data.usuario.nombre);
                setTimeout(() => { window.location.href = '/dashboard'; }, 800);
                return;   // el botón queda desactivado mientras se redirige
            }
        } else {
            mensaje.style.color = '#dc2626';
            mensaje.innerText = data.error || 'Ocurrió un error en la autenticación';
        }
    } catch (err) {
        console.error(err);
        mensaje.style.color = '#dc2626';
        mensaje.innerText = 'Error de conexión con el servidor';
    }
    botonEnviar.disabled = false;
});
