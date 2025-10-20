import express from "express";
import pg from "pg";
import env from "dotenv";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import crypto from "crypto";
import multer from "multer";
import path from "path";

env.config();

const app = express();
const port = process.env.PORT;
const saltRounds = Number(process.env.SALT_ROUND);

let items = []
let trending = []

let choc_cakes = []
let vanilla_cakes = []
let elegant_cakes = []
let birthday_cakes = []

let orderCount = 0;

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
app.use(express.static("public"));
app.use(express.json())
app.use(express.urlencoded({ extended: true }));

db.connect();

db.query("SELECT * FROM cakes ORDER BY likes DESC", (err, res) => {
    if(err) {
        console.log("Error " + err.stack);
    }
    else {
        items = res.rows;
        trending = res.rows.slice(0, 3);
    }
})

db.query("SELECT cakes.id AS id, name, img, price, likes, type FROM cake_types JOIN cakes ON cakes.id = cake_types.cake_id",(err, res) => {

    let types;

    if(err) {
        console.log("Error " + err.stack);
    }
    else {

        types = res.rows;

        types.forEach((cake) => {
            if (cake.type === "Chocolate") choc_cakes.push(cake);
            if (cake.type === "Vanilla") vanilla_cakes.push(cake);
            if (cake.type === "Elegant") elegant_cakes.push(cake);
            if (cake.type === "Birthday") birthday_cakes.push(cake);
        });
    }
})


app.get("/", async (req, res) => {

    if (req.isAuthenticated()) {

        const liked = await db.query(
            "SELECT cake_id FROM likes WHERE user_id = $1",
            [req.user.id]
        );

        const likedIds = liked.rows.map(l => l.cake_id);

        console.log(req.user.email);
        console.log(process.env.ADMIN_ACCOUNT);
        console.log(req.user.email.trim() === process.env.ADMIN_ACCOUNT.trim());

        if (req.user && req.user.email.trim() === process.env.ADMIN_ACCOUNT.trim()) {
        console.log("✅ Admin login successful");
        return res.redirect("/admin");
        }

        const result = await db.query(
            "SELECT count(*) AS count FROM orders WHERE users_id=$1",
            [req.user.id]
        );
        const orderCount = result.rows[0].count || 0;

        res.render("index.ejs", {
            items,
            trending,
            user: req.user,
            choc_cakes,
            elegant_cakes,
            orders: orderCount,
            likedIds 
        });

    } else {
        res.render("index.ejs", {items : items, trending : trending, user : null, choc_cakes : choc_cakes, elegant_cakes : elegant_cakes});
    }   
})


app.get("/gallery", async (req, res) => {

    db.query("SELECT * FROM cakes ORDER BY likes DESC", (err, res) => {
        if(err) {
            console.log("Error " + err.stack);
        }
        else {
            items = res.rows;
            trending = res.rows.slice(0, 3);
        }
    })

    if(req.isAuthenticated()) {
        const liked = await db.query("SELECT cake_id FROM likes WHERE user_id = $1", [req.user.id]);
        const likedIds = liked.rows.map(l => l.cake_id);
        res.render("gallery.ejs", {user : req.user, cakes : items, orders : orderCount, banner : "general", likedIds});
    }
    else {
        res.render("gallery.ejs", {user : req.user, cakes : items, orders : orderCount, banner : "general"});
    }
})

app.post("/gallery", async (req, res) => {

    db.query("SELECT * FROM cakes ORDER BY likes DESC", (err, res) => {
        if(err) {
            console.log("Error " + err.stack);
        }
        else {
            items = res.rows;
            trending = res.rows.slice(0, 3);
        }
    })

    const type = req.body.type;
    let arr = items;

    if(type === "chocolate") {
        arr = choc_cakes;
    }
    else if (type === "elegant") {
        arr = elegant_cakes;
    }
    else if(type === "vanilla") {
        arr = vanilla_cakes;
    }
    else if (type === "birthday") {
        arr = birthday_cakes;
    }

    if(req.isAuthenticated()) {
        const liked = await db.query("SELECT cake_id FROM likes WHERE user_id = $1", [req.user.id]);
        const likedIds = liked.rows.map(l => l.cake_id);
        res.render("gallery.ejs", {user : req.user, cakes : arr, orders : orderCount, banner : type, likedIds});
    }
    else {
        res.render("gallery.ejs", {user : req.user, cakes : arr, orders : orderCount, banner : type});
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
    if (result.rows.length > 0) {
      return res.redirect("/login");
    }

    bcrypt.hash(password, saltRounds, async (err, hash) => {
      if (err) return console.log(err);

      const verifyToken = crypto.randomBytes(32).toString("hex");

      const insertResult = await db.query(
        "INSERT INTO users (email, password, verify_token, verified) VALUES ($1, $2, $3, $4) RETURNING *",
        [username, hash, verifyToken, false]
      );

      const user = insertResult.rows[0];

      // --- Set up email transport ---
      const transporter = nodemailer.createTransport({
        service: "gmail", // or use SMTP
        auth: {
          user: process.env.EMAIL_USER, // your gmail address
          pass: process.env.EMAIL_PASS  // app password (not your gmail password!)
        }
      });

      const verifyLink = `http://localhost:${port}/verify?token=${verifyToken}`;

      // --- Send verification email ---
      await transporter.sendMail({
        from: `"Elysian Bytes" <${process.env.EMAIL_USER}>`,
        to: username,
        subject: "Verify your Elysian Bytes account",
        html: `
          <h2>Welcome to Elysian Bytes 🎂</h2>
          <p>Please click the link below to verify your account:</p>
          <a href="${verifyLink}">${verifyLink}</a>
        `
      });

      console.log("Verification email sent to:", username);
      res.send("Registration successful! Please check your email to verify your account.");
    });
  } catch (err) {
    console.log(err);
    res.send("Error during registration");
  }
});

app.get("/verify", async (req, res) => {
  const token = req.query.token;

  try {
    const result = await db.query("SELECT * FROM users WHERE verify_token = $1", [token]);

    if (result.rows.length === 0) {
      return res.send("Invalid or expired token.");
    }

    const user = result.rows[0];

    await db.query("UPDATE users SET verified = true, verify_token = NULL WHERE id = $1", [user.id]);

    // Optional: automatically log them in
    req.logIn(user, (err) => {
      if (err) return res.send("Verification successful, but login failed.");
      res.redirect("/");
    });
  } catch (err) {
    console.log(err);
    res.send("Verification failed.");
  }
});


passport.use(
"local",
new Strategy(async function verify(username, password, cb) {

    try {
    const result = await db.query("SELECT * FROM users WHERE email = $1 ", [username]);
    if (result.rows.length > 0) {

        const user = result.rows[0];
        const storedHashedPassword = user.password;

        if (!user.verified) {
            return cb(null, false, { message: "Please verify your email first." });
        }

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

            res.render("order.ejs", {cakes : result.rows, total : total, orders : orderCount });
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
            console.log(userId);
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


app.get("/payment", async (req, res) => {
    res.render("Payment.ejs")
})

app.post("/add", async (req, res) => {
    const { referenceid, phoneNumber } = req.body;

    try {
        await db.query(
        "INSERT INTO queue (referenceid, phone, user_id) VALUES ($1, $2, $3)", [referenceid, phoneNumber, req.user.id]);
        console.log("Data inserted");
        res.redirect("/"); 
    } catch (err) {
        console.error("Error inserting: ", err);
        res.send("Error inserting data");
    }
});



// --- Multer setup for storing proof images ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/images/proofs"); // where to save
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "proof-" + uniqueSuffix + ext); // proof-123123123.png
  },
});

const upload = multer({ storage: storage });

// --- Upload route ---
app.post("/upload", upload.single("proof"), async (req, res) => {
  try {
    const { amount, reference, phone } = req.body;
    const proofPath = "images/proofs/" + req.file.filename;
    const userId = req.user ? req.user.id : null;

    // Insert into payments table
    const result = await db.query(
      `INSERT INTO payments (amount, reference, phone, proof_path, submitted_at, user_id)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       RETURNING *`,
      [amount, reference, phone, proofPath, userId]
    );

    // 👇 Create the object for the email
    const newOrder = {
      amount,
      reference,
      phone,
      imageUrl: `http://localhost:${port}/${proofPath}`, // public URL for the image
      customerName: req.user ? req.user.email : "Guest",
    };

    // Send the email to your admin inbox
    await sendOrderEmail(newOrder);

    console.log("✅ Payment submission recorded:", reference);
    res.send("Your payment proof has been submitted. Please wait for verification.");
  } catch (err) {
    console.error("❌ Error uploading payment:", err);
    res.status(500).send("Error submitting payment proof.");
  }
});



const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, 
  },
});

async function sendOrderEmail(order) {
  const mailOptions = {
    from: `"Elysian Bytes" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_USER, // ✅ send to yourself (admin inbox)
    subject: `🧾 New GCash Payment Proof from ${order.customerName || "Unknown"}`,
    html: `
      <h2>New Payment Received</h2>
      <p><b>Reference ID:</b> ${order.reference}</p>
      <p><b>Amount:</b> ₱${order.amount}</p>
      <p><b>Phone:</b> ${order.phone}</p>
      <p><b>Date:</b> ${new Date().toLocaleString()}</p>
      <p><b>Status:</b> Pending Verification</p>
      ${
        order.imageUrl
          ? `<p><b>Proof:</b> <a href="${order.imageUrl}">View Image</a></p>`
          : ""
      }
    `,
  };

  await transporter.sendMail(mailOptions);
}


// Example routes for admin management

// Get all payments
app.get("/admin", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        p.id AS payment_id,
        u.email,
        p.phone,
        TO_CHAR(p.submitted_at, 'DD/MM/YY') AS date,
        p.reference,
        p.proof_path,
        p.verified,
        p.status,
        SUM(c.price) AS total_price,
        JSON_AGG(
          JSON_BUILD_OBJECT('name', cake_counts.name, 'quantity', cake_counts.quantity)
        ) AS order_list
      FROM payments p
      JOIN users u ON p.user_id = u.id
      JOIN (
        SELECT 
          o.users_id,
          c.name,
          COUNT(c.id) AS quantity,
          MIN(c.price) AS price
        FROM orders o
        JOIN cakes c ON o.cakes_id = c.id
        GROUP BY o.users_id, c.name
      ) AS cake_counts ON cake_counts.users_id = u.id
      JOIN cakes c ON c.name = cake_counts.name
      GROUP BY p.id, u.email, p.phone, p.reference, p.proof_path, p.verified, p.status, p.submitted_at
      ORDER BY p.id DESC;
    `);

    res.render("admin.ejs", { payments: result.rows });
  } catch (err) {
    console.error("Error fetching admin data:", err);
    res.status(500).send("Error loading admin dashboard.");
  }
});

// === EMAIL HELPERS ===
async function sendStatusEmail(to, reference, status) {
  let subject, html;

  if (status === "Verified") {
    subject = "✅ Your Cake Payment Has Been Verified!";
    html = `
      <h2>Payment Verified</h2>
      <p>Hi there,</p>
      <p>Your payment for order <b>${reference}</b> has been <b>successfully verified</b>.</p>
      <p>We’re now preparing your cake — you’ll get another update once it’s ready. 🎂</p>
      <p>Thank you for shopping with <b>Elysian Bytes</b>!</p>
    `;
  } else if (status === "Finished") {
    subject = "🎂 Your Cake Order is Finished!";
    html = `
      <h2>Good news!</h2>
      <p>Your cake order <b>${reference}</b> has been marked as <b>Finished</b>.</p>
      <p>It’s now ready for pickup or will be delivered soon. 🧁</p>
      <p>Thank you for choosing <b>Elysian Bytes</b>!</p>
    `;
  } else if (status === "Delivered") {
    subject = "🚚 Your Cake Order Has Been Delivered!";
    html = `
      <h2>Yay! 🎉</h2>
      <p>Your cake order <b>${reference}</b> has been <b>Delivered</b>.</p>
      <p>We hope you enjoy your sweet treat. 🍰</p>
      <p>Thank you for trusting <b>Elysian Bytes</b>!</p>
    `;
  }

  await transporter.sendMail({
    from: `"Elysian Bytes" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

// === ADMIN ROUTES ===

// Verify payment
app.post("/admin/verify/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("UPDATE payments SET verified = TRUE WHERE id = $1", [id]);

    const result = await db.query(
      `SELECT u.email, p.reference 
       FROM payments p 
       JOIN users u ON p.user_id = u.id 
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length > 0) {
      const { email, reference } = result.rows[0];
      await sendStatusEmail(email, reference, "Verified");
      console.log(`✅ Verification email sent to ${email}`);
    }

    res.redirect("/admin");
  } catch (err) {
    console.error("❌ Error verifying payment:", err);
    res.status(500).send("Error verifying payment.");
  }
});

// Mark as Finished
app.post("/admin/finish/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("UPDATE payments SET status = 'Finished' WHERE id = $1", [id]);

    const result = await db.query(
      `SELECT u.email, p.reference 
       FROM payments p 
       JOIN users u ON p.user_id = u.id 
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length > 0) {
      const { email, reference } = result.rows[0];
      await sendStatusEmail(email, reference, "Finished");
      console.log(`✅ Finished email sent to ${email}`);
    }

    res.redirect("/admin");
  } catch (err) {
    console.error("❌ Error marking Finished:", err);
    res.status(500).send("Error marking as Finished.");
  }
});

// Mark as Delivered
app.post("/admin/deliver/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("UPDATE payments SET status = 'Delivered' WHERE id = $1", [id]);

    const result = await db.query(
      `SELECT u.email, p.reference 
       FROM payments p 
       JOIN users u ON p.user_id = u.id 
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length > 0) {
      const { email, reference } = result.rows[0];
      await sendStatusEmail(email, reference, "Delivered");
      console.log(`✅ Delivered email sent to ${email}`);
    }

    res.redirect("/admin");
  } catch (err) {
    console.error("❌ Error marking Delivered:", err);
    res.status(500).send("Error marking as Delivered.");
  }
});

// Delete payment
app.post("/admin/delete/:id", async (req, res) => {
  const { id } = req.params;
  await db.query("DELETE FROM payments WHERE id = $1", [id]);
  res.redirect("/admin");
});




app.post("/like/:cakeId", async (req, res) => {

  try {

    if (!req.isAuthenticated()) {
      return res.status(401).json({ success: false, message: "Please log in first." });
    }

    const userId = req.user.id;
    const cakeId = parseInt(req.params.cakeId);

    // Check if the user already liked this cake
    const checkLike = await db.query(
      "SELECT * FROM likes WHERE user_id = $1 AND cake_id = $2",
      [userId, cakeId]
    );

    if (checkLike.rows.length > 0) {
      // Already liked → remove the like
      await db.query("DELETE FROM likes WHERE user_id = $1 AND cake_id = $2", [userId, cakeId]);
      await db.query("UPDATE cakes SET likes = likes - 1 WHERE id = $1", [cakeId]);
      return res.json({ success: true, liked: false });
    } else {
      // Not liked → add the like
      await db.query("INSERT INTO likes (user_id, cake_id) VALUES ($1, $2)", [userId, cakeId]);
      await db.query("UPDATE cakes SET likes = likes + 1 WHERE id = $1", [cakeId]);
      return res.json({ success: true, liked: true });
    }
  } catch (err) {
    console.error("Error toggling like:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



app.listen(port, () => {
    console.log("listening on port " + port);
})



