-- Drop existing tables to avoid conflicts
DROP TABLE IF EXISTS likes CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS cake_types CASCADE;
DROP TABLE IF EXISTS cakes CASCADE;
DROP TABLE IF EXISTS users CASCADE;


CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    password VARCHAR(150) NOT NULL
);


CREATE TABLE cakes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(40) NOT NULL,
    img VARCHAR(100) NOT NULL,
    price INTEGER NOT NULL,
    amountbought INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0
);


CREATE TABLE cake_types (
    id SERIAL PRIMARY KEY,
    cake_id INTEGER,
    type VARCHAR(50) DEFAULT 'unspecified',
    FOREIGN KEY (cake_id) REFERENCES cakes(id) ON DELETE CASCADE
);


CREATE TABLE likes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    cake_id INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (cake_id) REFERENCES cakes(id) ON DELETE CASCADE
);


CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    users_id INTEGER NOT NULL,
    cakes_id INTEGER NOT NULL,
    date_order TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (users_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (cakes_id) REFERENCES cakes(id) ON DELETE CASCADE
);