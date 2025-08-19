import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { Resend } from "resend";

const app=express();
const port=3000;
const saltRounds = 10;
dotenv.config();

app.use(bodyParser.urlencoded({extended:true}));
app.use("/assets", express.static("public"));
app.use(express.json());
app.set("view engine", "ejs");

app.use(session(
  {
    secret:"TOPSECRETWORD",
    resave:false,
    saveUninitialized:true,
    cookie:{
      maxAge:1000*60*60*24,
    }
  }
));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database:process.env.DB_NAME ,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});
db.connect();

//global middleware
app.use((req, res, next) => {
  res.locals.cartCount = req.session.cart
    ? req.session.cart.reduce((sum, item) => sum + item.quantity, 0)
    : 0;
  next();
});

 
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}

//to store pages that render latel
app.get("/store", (req, res) => {
  res.render("store");
});

//welcome get route
app.get("/",(req,res)=>{
  res.render("welcome");
});

//login get route
app.get("/login",(req,res)=>{
    res.render("login");
});

//register get route
app.get("/register",(req,res)=>{
  res.render("register");
});

//get route for all products in a category
app.get("/categories/:id",async(req,res)=>{
  const categoryID=Number(req.params.id);
  if(Number.isNaN(categoryID)){
    return res.status(404).send("Invalid Caegory");
  }
  try{
  const check=await db.query("SELECT id,name FROM categories WHERE id= $1",[categoryID]);
  if(check.rows.length === 0){
    return res.status(404).send("Category Not Found");
  }
  const productRes=await db.query("SELECT id, name, description, price, image_url, quantity FROM products WHERE category_id = $1 ORDER BY id DESC",
      [categoryID] );
      const products = productRes.rows.map(prevValue => ({
      ...prevValue,
      price: typeof prevValue.price === "string" ? parseFloat(prevValue.price) : prevValue.price
    }));

    res.render("products", { products, category: check.rows[0] });

  } catch (err) {
    console.error("Failed to load category:", err);
    res.status(500).send("Server error");
  }
});

//get route for live seatch
app.get("/search",async(req,res)=>{
  try{
    const query=req.query.query||'';
     const result = await db.query(
  "SELECT * FROM products WHERE LOWER(name) LIKE LOWER($1) OR LOWER(description) LIKE LOWER($1)",
  [`%${query}%`]
);
res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database query failed" });
    }
});

app.get("/newArrivals", async (req, res) => {
    try {
        const result = await db.query(
            "SELECT * FROM products ORDER BY created_at DESC LIMIT 10"
        );
        res.render("newArrivals", { products: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database query failed");
    }
});


// Get route for all categories
app.get("/categories", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM categories ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database query failed" });
  }
});

//get route for categories by id
app.get("/categories/:id/products", async (req, res) => {
    try {
        const categoryId = req.params.id;
        const result = await db.query(
            "SELECT * FROM products WHERE category_id = $1",
            [categoryId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Database query failed" });
    }
});

//get route for Customer-service 
app.get("/customer-service", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM faqs ORDER BY id ASC");
       res.render("customer-service", { faqs: result.rows });
    } catch (err) {
        console.error("Error fetching FAQs:", err);
        res.status(500).send("Server Error");
    }
});

//get route for all products 
app.get("/products", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM products ORDER BY id ASC");
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

//get route for explore
app.get('/explore', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products ORDER BY id ASC');
    res.render("explore", { products: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// GET route to get cart count
app.get("/cart/count", async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.json({ cartCount: 0 });
  }

  try {
    const result = await db.query(
      `SELECT COALESCE(SUM(oi.quantity), 0) AS cart_count
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE o.user_id = $1
         AND o.status = 'cart'`,
      [req.user.id]
    );
    res.json({ cartCount: Number(result.rows[0].cart_count) });
  } catch (err) {
    console.error("GET /cart/count error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET route to display the cart page
app.get("/cart", ensureAuthenticated, async (req, res) => {
  try {
    // 1. Find the user's current 'cart' order
    const cartOrderResult = await db.query(
      `SELECT id FROM orders WHERE user_id = $1 AND status = 'cart'`,
      [req.user.id]
    );

    let cartItems = [];
    let totalPrice = 0;

    if (cartOrderResult.rows.length > 0) {
      const orderId = cartOrderResult.rows[0].id;

      // 2. Fetch all items associated with that cart order
      const cartItemsResult = await db.query(
        `SELECT
          oi.product_id AS id,
          p.name,
          p.image_url,
          oi.quantity,
          oi.price_at_purchase AS price
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1`,
        [orderId]
      );
      cartItems = cartItemsResult.rows;

      // 3. Calculate the total price of the cart
      totalPrice = cartItems.reduce(
        (sum, item) => sum + (item.quantity * parseFloat(item.price)),
        0
      );
    }

    // 4. Render the cart.ejs view with the fetched data
    res.render("cart", { cart: cartItems, totalPrice: totalPrice });
  } catch (err) {
    console.error("GET /cart error:", err);
    res.status(500).send("Server error");
  }
});

//login post route
app.post("/login",
  passport.authenticate("local",
    {
     successRedirect:"/store",
  failureRedirect:"/login",
}));
 
passport.use(new Strategy(
  { usernameField: "email" },  
  async function verify(email, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password_hash;

        bcrypt.compare(password, storedHashedPassword, (err, isMatch) => {
          if (err) {
            return cb(err);
          } else if (isMatch) {
            return cb(null, user);
          } else {
            return cb(null, false);
          }
        });

      } else {
        return cb(null, false);
      }
    } catch (err) {
      return cb(err);
    }
  }
));

// Register Post
app.post("/register",async(req,res)=>{
  const name=req.body.name;
  const email=req.body.email;
  const password=req.body.password;
  try{
       const Checkresult= await db.query("SELECT * from users WHERE email = $1", [email]);
       if(Checkresult.rows.length>0){
        return res.redirect("/login");
       }
       else{
            bcrypt.hash(password,saltRounds ,async(err,hash)=>{
              if(err){
                console.log("Error hashing password:", err);
              }
              else{
                const result=await db.query("INSERT INTO users (name,email,password_hash) VALUES ($1, $2 ,$3) RETURNING *",
            [name,email, hash]
          );
           console.log("User registered successfully");
           res.redirect("/login");
        
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});

//get route for about pg
app.get("/about", (req, res) => {
    res.render("about"); 
});

//get route for careers pg
app.get("/careers", (req, res) => {
    res.render("careers");
});

//get route for blog pg
app.get("/blog", (req, res) => {
    res.render("blog");
});

//get route for contact pg
app.get("/contact", (req, res) => {
    res.render("contact");
});

//get route for mission pg
app.get("/mission", (req, res) => {
    res.render("mission");
});

//get route for checkout
app.get("/checkout", ensureAuthenticated, async (req, res) => {
  try {
    // Fetch user's cart details to display summary if needed
    const cartOrderResult = await db.query(
      `SELECT id, total_amount FROM orders WHERE user_id = $1 AND status = 'cart'`,
      [req.user.id]
    );

    if (cartOrderResult.rows.length === 0) {
      return res.redirect("/cart"); // No cart found, go back
    }

    res.render("checkout"); // You can pass cart summary if needed
  } catch (err) {
    console.error("GET /checkout error:", err);
    res.status(500).send("Server error");
  }
});

//get route for success pg
app.get("/order-success", ensureAuthenticated, (req, res) => {
  res.render("order-success");
});


app.post("/cart/add/:id", async (req, res) => {
 const prodID = req.params.id;

 if (!req.user || !req.user.id) {
 return res.status(401).json({ error: "Login required" }); }

 try {
   // 1. Find existing cart order for the user
   let orderResult = await db.query(
   `SELECT id FROM orders WHERE user_id = $1 AND status = 'cart'`,
   [req.user.id]
   );

   let orderId;
   if (orderResult.rows.length === 0) {
    const newOrder = await db.query(
      `INSERT INTO orders (user_id, status) VALUES ($1, 'cart') RETURNING id`,
      [req.user.id]
    );
    orderId = newOrder.rows[0].id;
   } else {
   orderId = orderResult.rows[0].id;
   }

    // ✅ FIX: Fetch the price of the product from the 'products' table
    const productResult = await db.query(
        `SELECT price FROM products WHERE id = $1`,
        [prodID]
    );
    if (productResult.rows.length === 0) {
        return res.status(404).json({ error: "Product not found" });
    }
    const priceAtPurchase = productResult.rows[0].price;

   // 2. Check if this product is already in the cart
   const existingItem = await db.query(
    `SELECT id, quantity FROM order_items WHERE order_id = $1 AND product_id = $2`,
    [orderId, prodID]
   );

   if (existingItem.rows.length > 0) {
    // Increment quantity
    await db.query(
    `UPDATE order_items SET quantity = quantity + 1 WHERE id = $1`,
    [existingItem.rows[0].id]
);

   } else {
    // ✅ FIX: Insert new cart item with the fetched price
    await db.query(
      `INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES ($1, $2, 1, $3)`,
      [orderId, prodID, priceAtPurchase] // <-- Pass priceAtPurchase here
    );
   }

   // 3. Return updated cart count
   const countResult = await db.query(
    `SELECT COALESCE(SUM(oi.quantity), 0) AS cart_count
   FROM order_items oi
   JOIN orders o ON oi.order_id = o.id
   WHERE o.user_id = $1 AND o.status = 'cart'`,
    [req.user.id]
   );

   res.json({ cartCount: Number(countResult.rows[0].cart_count) });
 } catch (err) {
   console.error("POST /cart/add error:", err);
   res.status(500).json({ error: "Server error" });  }
});

//POST route to increment product quantity in cart
app.post("/cart/increment/:id", async (req, res) => {
    if (!req.user || !req.user.id) {
        return res.status(401).json({ error: "Login required" });
    }
    const productId = req.params.id;

    try {
        const cartOrder = await db.query(
            `SELECT id FROM orders WHERE user_id = $1 AND status = 'cart'`,
            [req.user.id]
        );
        
        if (cartOrder.rows.length > 0) {
            const orderId = cartOrder.rows[0].id;
           await db.query(
                `UPDATE order_items SET quantity = quantity + 1 WHERE order_id = $1 AND product_id = $2`,
                [orderId, productId]
            );
        }
        res.redirect("/cart");
    } catch (err) {
        console.error("POST /cart/increment error:", err);
        res.status(500).send("Server error");
    }
});

// POST route to decrement product quantity in cart
app.post("/cart/decrement/:id", async (req, res) => {
    if (!req.user || !req.user.id) {
        return res.status(401).json({ error: "Login required" });
    }
    const productId = req.params.id;

    try {
        const cartOrder = await db.query(
            `SELECT id FROM orders WHERE user_id = $1 AND status = 'cart'`,
            [req.user.id]
        );
        
        if (cartOrder.rows.length > 0) {
            const orderId = cartOrder.rows[0].id;
            const existingItem = await db.query(
                `SELECT quantity FROM order_items WHERE order_id = $1 AND product_id = $2`,
                [orderId, productId]
            );

            if (existingItem.rows.length > 0 && existingItem.rows[0].quantity > 1) {
                await db.query(
                    `UPDATE order_items SET quantity = quantity - 1 WHERE order_id = $1 AND product_id = $2`,
                    [orderId, productId]
                );
            } else {
                // If quantity is 1, remove the item entirely
                await db.query(
                    `DELETE FROM order_items WHERE order_id = $1 AND product_id = $2`,
                    [orderId, productId]
                );
            }
        }
        res.redirect("/cart");
    } catch (err) {
        console.error("POST /cart/decrement error:", err);
        res.status(500).send("Server error");
    }
});

// POST route to remove product from cart
app.post("/cart/remove/:id", async (req, res) => {
    if (!req.user || !req.user.id) {
        return res.status(401).json({ error: "Login required" });
    }
    const productId = req.params.id;

    try {
        const cartOrder = await db.query(
            `SELECT id FROM orders WHERE user_id = $1 AND status = 'cart'`,
            [req.user.id]
        );

        if (cartOrder.rows.length > 0) {
            const orderId = cartOrder.rows[0].id;
            await db.query(
                `DELETE FROM order_items WHERE order_id = $1 AND product_id = $2`,
                [orderId, productId]
            );
        }
        res.redirect("/cart");
    } catch (err) {
        console.error("POST /cart/remove error:", err);
        res.status(500).send("Server error");
    }
});

// //post route for email
// const transporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST,
//   port: process.env.SMTP_PORT,
//   secure: false, // use true for port 465
//   auth: {
//     user: process.env.SMTP_USER,
//     pass: process.env.SMTP_PASS
//   }
// });

// const transporter=nodemailer.createTransport({
//   secure:true,
//   host:'smtp.gmail.com',
//   auth:{
//     user:'awanmahaz71@gmail.com',
//     pass:'pzge cuwr reku pyhm'
//   }
// });
//  function sendMail(to,sub,mes){
//   transporter.sendMail({
//     to:to,
//     subject:sub,
//     html:msg
//   });
 //}
//  app.post("/contact", async (req, res) => {
//   const { name, email, message } = req.body;

//   try {
//     await transporter.sendMail({
//       from: `"Website Contact" <${process.env.SMTP_USER}>`, // Use SMTP user email
//       to: process.env.COMPANY_EMAIL,
//       replyTo: email,
//       subject: `New Contact Form Submission from ${name}`,
//       text: message,
//       html: `<p><strong>Name:</strong> ${name}</p>
//              <p><strong>Email:</strong> ${email}</p>
//              <p><strong>Message:</strong><br>${message}</p>`
//     });

//     res.send("✅ Message sent successfully!");
//   } catch (error) {
//     console.error("❌ Failed to send message:", error);
//     res.status(500).send("❌ Failed to send message.");
//   }
// });
// const resend = new Resend(process.env.RESEND_API_KEY);

// app.post("/contact", async (req, res) => {
//   const { name, email, message } = req.body;
//   try {
//     const data = await resend.emails.send({
//       from: "Website Contact <onboarding@resend.dev>",
//       to: process.env.COMPANY_EMAIL,
//       reply_to: email,
//       subject: `New Contact Form Submission from ${name}`,
//       html: `<p><strong>Name:</strong> ${name}</p>
//              <p><strong>Email:</strong> ${email}</p>
//              <p><strong>Message:</strong><br>${message}</p>`
//     });
//     console.log("✅ Email sent:", data);
//     res.send("✅ Message sent successfully!");
//   } catch (error) {
//     console.error(error);
//     res.status(500).send("❌ Failed to send message.");
//   }
// });



const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,       // SSL port for Gmail
  secure: true,    // true for 465
  auth: {
    user: "awanmahaz71@gmail.com",     // your Gmail address
    pass: "pzge cuwr reku pyhm"        // your generated App Password
  }
});

app.post("/contact", async (req, res) => {
  const { name, email, message } = req.body;

  try {
    const info = await transporter.sendMail({
      from: `"Website Contact" <awanmahaz71@gmail.com>`, // sender must match Gmail
      to: "awanmahaz71@gmail.com", // recipient (company inbox)
      replyTo: email,              // user’s email
      subject: `New Contact Form Submission from ${name}`,
      text: message,
      html: `<p><strong>Name:</strong> ${name}</p>
             <p><strong>Email:</strong> ${email}</p>
             <p><strong>Message:</strong><br>${message}</p>`
    });

    console.log("📩 Email sent:", info.messageId); // log for debug
    res.send(" Message sent successfully!");
  } catch (error) {
    console.error("Failed to send message:", error);
    res.status(500).send("Failed to send message.");
  }
});

// POST checkout form
// app.post("/checkout", ensureAuthenticated, async (req, res) => {
//   const { fullName, address, city, zip, paymentMethod,email} = req.body;

//   try {
//     // 1. Find the current cart
//     const orderResult = await db.query(
//       `SELECT id FROM orders WHERE user_id = $1 AND status = 'cart'`,
//       [req.user.id]
//     );

//     if (orderResult.rows.length === 0) {
//       return res.redirect("/cart"); // No cart, can't checkout
//     }

//     const orderId = orderResult.rows[0].id;

//     // 2. Update order with checkout info and change status
//     await db.query(
//       `UPDATE orders
//        SET status = 'pending',
//            full_name = $1,
//            shipping_address = $2,
//            city = $3,
//            postal_code = $4,
//            payment_method = $5,
//            placed_at = NOW()
//        WHERE id = $6`,
//       [fullName, address, city, zip, paymentMethod, orderId]
//     );

// const itemsResult = await db.query(
//   `SELECT oi.product_id, p.name AS product_name, oi.quantity, oi.price_at_purchase
//    FROM order_items oi
//    JOIN products p ON oi.product_id = p.id
//    WHERE oi.order_id = $1`,
//   [orderId]
// );


// for (const item of itemsResult.rows) {
//   await db.query(
//     `UPDATE products SET quantity = quantity - $1 WHERE id = $2`,
//     [item.quantity, item.product_id]
//   );
// }
// //Confirm the order (final step before success page)
//     await db.query(
//       `UPDATE orders SET status = 'confirmed' WHERE id = $1`,
//       [orderId]
//     );

//     let itemsHtml = `
// <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
//   <tr>
//     <th>Product</th>
//     <th>Quantity</th>
//     <th>Price</th>
//     <th>Subtotal</th>
//   </tr>
// `;

// itemsResult.rows.forEach(item => {
//     const price = parseFloat(item.price_at_purchase); // convert string to number
//   const subtotal = price * item.quantity;
//   itemsHtml += `
//   <tr>
//     <td>${item.product_name}</td>
//     <td>${item.quantity}</td>
//     <td>$${price.toFixed(2)}</td>
//     <td>$${subtotal.toFixed(2)}</td>
//   </tr>
//   `;
// });

// itemsHtml += `</table>`;


//     await transporter.sendMail({
//   from: `"The Essentials Shop" <awanmahaz71@gmail.com>`,
//   to: "awanmahaz71@gmail.com",            // company/admin email
//   replyTo: req.user.email,                // customer's email
//   subject: `New Order #${orderId} from ${fullName}`,
//   html: `<h2>New Order Received</h2>
//          <p><strong>Customer:</strong> ${fullName}</p>
//          <p><strong>Email:</strong> ${req.user.email}</p>
//          <p><strong>Shipping Address:</strong> ${address}, ${city}, ${zip}</p>
//          <p><strong>Payment Method:</strong> ${paymentMethod}</p>
//          <h3>Items:</h3>
//          ${itemsHtml}`
// });


// // 3. Redirect to a thank-you page
//     res.redirect("/order-success");
//   } catch (err) {
//     console.error("POST /checkout error:", err);
//     res.status(500).send("Server error");
//   }
// });
// POST checkout form
app.post("/checkout", ensureAuthenticated, async (req, res) => {
  const { fullName, address, city, zip, paymentMethod, email } = req.body;

  try {
    // 1. Find the current cart
    const orderResult = await db.query(
      `SELECT id FROM orders WHERE user_id = $1 AND status = 'cart'`,
      [req.user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.redirect("/cart"); // No cart, can't checkout
    }

    const orderId = orderResult.rows[0].id;

    // 2. Get cart items to calculate total
    const itemsResult = await db.query(
      `SELECT oi.product_id, p.name AS product_name, oi.quantity, oi.price_at_purchase
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    let totalAmount = 0;
    itemsResult.rows.forEach(item => {
      totalAmount += parseFloat(item.price_at_purchase) * item.quantity;
    });

    // 3. Update order with checkout info & set status to pending
    await db.query(
      `UPDATE orders
       SET status = 'pending',
           full_name = $1,
           shipping_address = $2,
           city = $3,
           postal_code = $4,
           payment_method = $5,
           placed_at = NOW()
       WHERE id = $6`,
      [fullName, address, city, zip, paymentMethod, orderId]
    );

    // 4. Branch logic based on payment method
    if (paymentMethod === "cod") {
      // Reduce stock
      for (const item of itemsResult.rows) {
   
      const result = await db.query(
  `UPDATE products
   SET quantity = quantity - $1
   WHERE id = $2 AND quantity >= $1
   RETURNING *`,
  [item.quantity, item.product_id]
);
      
if (result.rows.length === 0) {
  return res.status(400).send(`Not enough stock for ${item.product_name}`);
}

    }    // Confirm the order
      await db.query(
        `UPDATE orders SET status = 'confirmed' WHERE id = $1`,
        [orderId]
      );

      // Send email notification
      let itemsHtml = `
<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
  <tr>
    <th>Product</th>
    <th>Quantity</th>
    <th>Price</th>
    <th>Subtotal</th>
  </tr>
`;
      itemsResult.rows.forEach(item => {
        const price = parseFloat(item.price_at_purchase);
        const subtotal = price * item.quantity;
        itemsHtml += `
  <tr>
    <td>${item.product_name}</td>
    <td>${item.quantity}</td>
    <td>$${price.toFixed(2)}</td>
    <td>$${subtotal.toFixed(2)}</td>
  </tr>
`;
      });
      itemsHtml += `</table>`;

      await transporter.sendMail({
        from: `"The Essentials Shop" <awanmahaz71@gmail.com>`,
        to: "awanmahaz71@gmail.com", // company/admin email
        replyTo: req.user.email,      // customer's email
        subject: `New Order #${orderId} from ${fullName}`,
        html: `<h2>New Order Received</h2>
               <p><strong>Customer:</strong> ${fullName}</p>
               <p><strong>Email:</strong> ${req.user.email}</p>
               <p><strong>Shipping Address:</strong> ${address}, ${city}, ${zip}</p>
               <p><strong>Payment Method:</strong> ${paymentMethod}</p>
               <h3>Items:</h3>
               ${itemsHtml}`
      });

      return res.redirect("/order-success");
    }

    // CREDIT CARD branch
    else if (paymentMethod === "credit_card") {
      // Stop here, do not confirm order yet
      // Send totalAmount and orderId to frontend for payment gateway
      return res.json({
        message: "Proceed to credit card payment",
        totalAmount,
        orderId
      });
    }

  } catch (err) {
    console.error("POST /checkout error:", err);
    res.status(500).send("Server error");
  }
});

passport.serializeUser((user, cb) => {
  cb(null, user.id); // store only user ID in session
});

passport.deserializeUser(async (id, cb) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    cb(null, result.rows[0]);
  } catch (err) {
    cb(err);
  }
});

app.listen(port, (req,res) => {
  console.log(`Server is Running at http://localhost:${port}`);
});
