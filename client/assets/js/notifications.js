/**
 * Notify — sistema de notificaciones toast para CEFIT
 * Uso: Notify.success(msg) | Notify.error(msg) | Notify.warning(msg) | Notify.info(msg)
 */
const Notify = (() => {
    let container = null;

    const ICONS = {
        success: '&#10003;',
        error:   '&#10005;',
        warning: '&#9888;',
        info:    '&#8505;'
    };

    const LABELS = {
        success: 'Éxito',
        error:   'Error',
        warning: 'Advertencia',
        info:    'Información'
    };

    function getContainer() {
        if (!container) {
            container = document.createElement('div');
            container.id = 'notify-container';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'false');
            document.body.appendChild(container);
        }
        return container;
    }

    function dismiss(toast) {
        clearTimeout(toast._notifyTimer);
        toast.classList.add('notify-exit');
        toast.addEventListener('animationend', () => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, { once: true });
    }

    function show(message, type = 'info', duration = 4500) {
        const ct = getContainer();

        const toast = document.createElement('div');
        toast.className = `notify-toast notify-${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.setAttribute('aria-label', `${LABELS[type]}: ${message}`);

        toast.innerHTML = `
            <span class="notify-icon" aria-hidden="true">${ICONS[type]}</span>
            <div class="notify-body">
                <span class="notify-label">${LABELS[type]}</span>
                <span class="notify-msg">${message}</span>
            </div>
            <button class="notify-close" aria-label="Cerrar notificación">&#10005;</button>
            <div class="notify-progress"></div>
        `;
        // Asignar duración vía propiedad DOM — no viola style-src 'self'
        toast.querySelector('.notify-progress').style.animationDuration = `${duration}ms`;

        toast.querySelector('.notify-close').addEventListener('click', () => dismiss(toast));

        ct.appendChild(toast);
        // forzar reflow para que la animación de entrada arranque
        void toast.offsetWidth;
        toast.classList.add('notify-enter');

        toast._notifyTimer = setTimeout(() => dismiss(toast), duration);
        return toast;
    }

    return {
        show,
        success: (msg, ms) => show(msg, 'success', ms),
        error:   (msg, ms) => show(msg, 'error',   ms || 6000),
        warning: (msg, ms) => show(msg, 'warning', ms),
        info:    (msg, ms) => show(msg, 'info',    ms)
    };
})();
