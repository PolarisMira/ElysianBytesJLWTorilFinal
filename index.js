import express from "express";
import pg from "pg";
import env from "dotenv";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import bcrypt from "bcrypt";

env.config();

const app = express();
const port = process.env.PORT;
const saltRounds = Number(process.env.SALT_ROUND);

const db = new pg.Client({
    user: process.env.PG_USER,
    host : process.env.PG_HOST, 
    database : process.env.PG_DATABASE,
    password : process.env.PG_PASSWORD,
    port: process.env.PG_PORT
});

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: {
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);

app.use(passport.session());
app.use(passport.initialize());

db.connect();

db.query("SELECT * FROM cakes ORDER BY likes DESC", (err, res) => {
    if(err) {
        console.log("Error " + err.stack);
    }
    else {
        trending = res.rows.splice(0,3)
        items = res.rows;
    }
})

app.use(express.static("public"));
app.use(express.json())
app.use(express.urlencoded({ extended: true }));



let items = []
let trending = []


app.get("/", (req, res) => {
    if (req.isAuthenticated()) {
        res.render("index.ejs", {items : items, trending : trending, user : req.user});
    } else {
        res.render("index.ejs", {items : items, trending : trending, user : null});
    }
})

app.get("/register", (req, res) => {
    res.render("register.ejs");
})

app.get("/login", (req, res) => {
    res.render("login.ejs")
})

app.get("/logout", (req, res) => {
req.logout(function (err) {
    if (err) {
    return next(err);
    }
    res.redirect("/");
});
});

app.post(
    "/login",
    passport.authenticate("local", {
        successRedirect: "/",   
        failureRedirect: "/login"
    })
);

app.post("/register", async (req, res) => {

    const username = req.body.username;
    const password = req.body.password;

    try {

        const result = await db.query("SELECT * FROM users WHERE email = $1", [username]);

        if(result.rows.length > 0) {
            res.redirect("/login");
        }
        else {
            bcrypt.hash(password, saltRounds, async (err, hash) => {
                if(err) {
                    console.log(err);
                }
                else {
                    const result = await db.query("INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *", [username, hash]);

                    const user = result.rows[0];

                    req.logIn(user, (err) => {
                        console.log("success");
                        res.redirect("/")
                    })
                }
            })
        }
    }
    catch(err) {
        console.log(err);
    }

})

passport.use(
"local",
new Strategy(async function verify(username, password, cb) {
    try {
    const result = await db.query("SELECT * FROM users WHERE email = $1 ", [username]);
    if (result.rows.length > 0) {

        const user = result.rows[0];
        const storedHashedPassword = user.password;

        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
        if (err) {
            console.error("Error comparing passwords:", err);
            return cb(err);
        } else {
            if (valid) {
            return cb(null, user);
            } else {
            return cb(null, false);
            }
        }
        });
    } else {
        return cb("User not found");
    }
    } catch (err) {
        console.log(err);
    }
})
);

passport.serializeUser((user, cb) => {
    cb(null, user.id); 
});

passport.deserializeUser(async (id, cb) => {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    cb(null, result.rows[0]);
});


app.get("/order", async (req, res) => {

    try {
        if(req.user) {
            
            const user_id = req.user.id;

            const result = await db.query(`
                SELECT 
                    c.name, 
                    c.img, 
                    COUNT(*) AS quantity, 
                    (c.price * COUNT(*)) AS price
                FROM orders o 
                JOIN cakes c ON o.cakes_id = c.id 
                WHERE o.users_id = $1 
                GROUP BY c.name, c.img, c.price`, [user_id]);

            let total = 0;

            result.rows.forEach((order) => {
                total += Number(order.price);
            })

            res.render("order.ejs", {orders : result.rows, total : total});
        }
    }
    catch(err) {
        console.log(err);
    }
})

app.post("/order", async (req, res) => {

    const cakeOrdered = req.body.cake_id;

    if(req.user) {
        try {
            const userId = req.user.id;
            await db.query("INSERT INTO orders (users_id, cakes_id) VALUES ($1, $2)", [userId, cakeOrdered]);
        }
        catch(err) {
            console.log(err);
        }
    }
    else {
        console.log("No Account Logged In")
    }
})

app.post("/delete/order", async (req, res) => {

    const cake_name = req.body.cake_name;
    const user_id = req.user.id;

    try {
        await db.query(`
            DELETE FROM orders o
            USING cakes c
            WHERE o.cakes_id = c.id
            AND o.users_id = $1
            AND c.name = $2;
        `, [user_id, cake_name]);
        res.redirect("/order");
    }
    catch(err) {
        console.log(err);
    }
})



app.listen(port, () => {
    console.log("listening on port " + port);
})