-- ============================================================
-- MÓDULO LOGIN - ESQUEMA BD Y DATOS INICIALES
-- ============================================================

-- ============================================================
-- RESET COMPLETO (borra todo y recrea desde cero)
-- ============================================================
DROP TABLE IF EXISTS users       CASCADE;
DROP TABLE IF EXISTS change_pass CASCADE;
DROP TABLE IF EXISTS permissions  CASCADE;

DROP TYPE IF EXISTS document_type_enum CASCADE;
DROP TYPE IF EXISTS sexo_enum          CASCADE;

-- ============================================================
-- EXTENSIÓN REQUERIDA PARA BCRYPT
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
    CREATE TYPE document_type_enum AS ENUM ('CC', 'TI', 'PS', 'PPT', 'DNI');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE sexo_enum AS ENUM ('M', 'F');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLA CHANGE_PASS
-- Se agregó expires_at para que los tokens de recuperación expiren
-- ============================================================
CREATE TABLE IF NOT EXISTS change_pass (
    id          VARCHAR(50)  PRIMARY KEY,
    expires_at  TIMESTAMP    NOT NULL,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TABLA USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              VARCHAR(50)          PRIMARY KEY,
    name            VARCHAR(100)         NOT NULL,
    lastname        VARCHAR(100)         NOT NULL,
    password        VARCHAR(255)         NOT NULL,
    email           VARCHAR(150)         UNIQUE NOT NULL,

    change_pass_id  VARCHAR(50),

    rol             VARCHAR(50)          DEFAULT 'usuario',
    document        VARCHAR(50),
    type_document   document_type_enum,

    phone           VARCHAR(20),
    address         VARCHAR(255),
    age             INT                  CHECK (age >= 0 AND age <= 110),

    departamento    VARCHAR(100),
    ciudad          VARCHAR(100),

    sexo            sexo_enum,
    active          BOOLEAN              DEFAULT FALSE,

    born            DATE,

    created_at      TIMESTAMP            DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP            DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_change_pass
        FOREIGN KEY (change_pass_id)
        REFERENCES change_pass(id)
        ON DELETE SET NULL
);

-- ============================================================
-- TABLA PERMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS permissions (
    id          VARCHAR(50)  PRIMARY KEY,
    permiso     VARCHAR(100) NOT NULL,
    description TEXT,
    rol         VARCHAR(50)  NOT NULL,
    CONSTRAINT uq_permiso_rol UNIQUE (permiso, rol)
);

-- ============================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_rol         ON users(rol);
CREATE INDEX IF NOT EXISTS idx_users_active      ON users(active);
CREATE INDEX IF NOT EXISTS idx_permissions_rol   ON permissions(rol);
CREATE INDEX IF NOT EXISTS idx_change_pass_exp   ON change_pass(expires_at);

-- ============================================================
-- DATOS INICIALES: PERMISOS POR ROL
-- ============================================================
INSERT INTO permissions (id, permiso, description, rol) VALUES
    ('perm-adm-001', 'ver_usuarios',      'Ver listado completo de usuarios del sistema',     'admin'),
    ('perm-adm-002', 'editar_usuarios',   'Editar datos de cualquier usuario',                'admin'),
    ('perm-adm-003', 'eliminar_usuarios', 'Eliminar usuarios del sistema',                    'admin'),
    ('perm-adm-004', 'cambiar_roles',     'Asignar o cambiar roles a usuarios',               'admin'),
    ('perm-adm-005', 'ver_reportes',      'Ver reportes y estadísticas del sistema',          'admin'),
    ('perm-adm-006', 'gestionar_permisos','Gestionar permisos del sistema',                   'admin'),

    ('perm-ven-001', 'gestionar_ventas',  'Crear y gestionar ventas y transacciones',         'vendedor'),
    ('perm-ven-002', 'ver_catalogo',      'Ver catálogo de productos y servicios',            'vendedor'),
    ('perm-ven-003', 'crear_clientes',    'Registrar nuevos clientes en el sistema',          'vendedor'),
    ('perm-ven-004', 'ver_comisiones',    'Consultar sus comisiones de ventas',               'vendedor'),

    ('perm-usr-001', 'ver_perfil',        'Ver su propio perfil de usuario',                  'usuario'),
    ('perm-usr-002', 'editar_perfil',     'Editar su propio perfil',                          'usuario'),
    ('perm-usr-003', 'ver_actividad',     'Ver su historial de actividad',                    'usuario')
ON CONFLICT (permiso, rol) DO NOTHING;

-- ============================================================
-- DATOS INICIALES: USUARIOS DE PRUEBA
-- Contraseñas (bcrypt costo 12):
--   admin@cefit.com    → CefitAdmin2024!
--   vendedor@cefit.com → CefitVend2024!
--   usuario@cefit.com  → CefitUser2024!
-- ============================================================
INSERT INTO users (
    id, name, lastname, email, password,
    rol, active, document, type_document,
    phone, departamento, ciudad, sexo, age, born
) VALUES
    (
        'usr-admin-cefit-001',
        'Administrador', 'Principal',
        'admin@cefit.com',
        crypt('CefitAdmin2024!', gen_salt('bf', 12)),
        'admin', true,
        '100000001', 'CC', '3001000001',
        'Cundinamarca', 'Bogotá', 'M', 35, '1989-01-15'
    ),
    (
        'usr-vendedor-cefit-001',
        'Carlos', 'Ramírez',
        'vendedor@cefit.com',
        crypt('CefitVend2024!', gen_salt('bf', 12)),
        'vendedor', true,
        '200000002', 'CC', '3102000002',
        'Antioquia', 'Medellín', 'M', 28, '1996-05-20'
    ),
    (
        'usr-usuario-cefit-001',
        'María', 'González',
        'usuario@cefit.com',
        crypt('CefitUser2024!', gen_salt('bf', 12)),
        'usuario', true,
        '300000003', 'CC', '3153000003',
        'Valle del Cauca', 'Cali', 'F', 24, '2000-11-08'
    )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PERMISOS DE BD RESTRICTIVOS (principio de mínimo privilegio)
-- Crear un usuario de aplicación dedicado antes de ejecutar:
--   CREATE ROLE app_user WITH LOGIN PASSWORD 'contraseña_segura';
-- ============================================================

-- Solo los permisos necesarios para la aplicación
GRANT CONNECT ON DATABASE registro_usuarios TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- SELECT, INSERT, UPDATE en tablas específicas (sin DELETE en users)
GRANT SELECT, INSERT, UPDATE ON TABLE users       TO app_user;
GRANT SELECT, INSERT, DELETE ON TABLE change_pass TO app_user;
GRANT SELECT                 ON TABLE permissions  TO app_user;

-- Acceso a los tipos ENUM
GRANT USAGE ON TYPE document_type_enum TO app_user;
GRANT USAGE ON TYPE sexo_enum          TO app_user;
