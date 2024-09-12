const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: [
      "https://heartsync-5b928.web.app",
      "https://heartsync-5b928.firebaseapp.com",
    ],
  })
);
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1gnzeig.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const biodataCollection = client.db("matrimony").collection("biodata");
    const userCollection = client.db("matrimony").collection("users");
    const favoriteCollection = client.db("matrimony").collection("favorites");
    const paymentCollection = client.db("matrimony").collection("payments");
    const marriageCollection = client.db("matrimony").collection("marriages");

    const contactRequestCollection = client
      .db("matrimony")
      .collection("contactRequests");

    // jwt api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // user apis

    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;

      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/users/premium/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          membership: "premium",
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // biodata api

    app.get("/biodata", async (req, res) => {
      const result = await biodataCollection.find().toArray();
      res.send(result);
    });

    app.get("/biodataCount", async (req, res) => {
      const count = await biodataCollection.estimatedDocumentCount();
      res.send({ count });
    });

    app.get("/searched-biodata", async (req, res) => {
      const { gender, minAge, maxAge, permaDivision } = req.query;

      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size);
      let query = {};

      if (gender) {
        query.gender = { $regex: gender };
      }

      if (minAge && maxAge) {
        query.age = { $gte: minAge, $lte: maxAge };
      } else if (minAge) {
        query.age = { $gte: minAge };
      } else if (maxAge) {
        query.age = { $lte: maxAge };
      }

      if (permaDivision) {
        query.permanentDivision = { $regex: permaDivision };
      }

      const result = await biodataCollection
        .find(query)
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });

    app.get("/premium-biodata", async (req, res) => {
      const filter = req.query;

      const query = {};

      const options = {
        sort: {
          age: filter.sort === "asc" ? 1 : -1,
        },
      };
      const result = await biodataCollection.find(query, options).toArray();
      res.send(result);
    });

    app.get("/biodata/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await biodataCollection.findOne(query);
      res.send(result);
    });

    app.get("/edit-biodata/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await biodataCollection.findOne(query);
      res.send(result);
    });

    app.get("/biodatas/:email", async (req, res) => {
      const query = { email: req.params.email };
      const result = await biodataCollection.findOne(query);
      res.send(result);
    });

    app.post("/biodata", async (req, res) => {
      const biodata = req.body;
      const query = { email: biodata.email };
      const existingUser = await biodataCollection.findOne(query);

      if (existingUser) {
        return res.send({
          message: "your Biodata already exists ",
          insertedId: null,
        });
      }

      const totalBiodata = await biodataCollection.countDocuments();

      let newBiodataId = totalBiodata + 1;
      const newInfo = {
        biodataId: newBiodataId,
        ...req.body,
      };

      const result = await biodataCollection.insertOne(newInfo);
      res.send(result);
    });

    app.put("/new-biodatas/:id", async (req, res) => {
      const id = req.params.id;
      const {
        name,
        photo,
        gender,
        birth_date,
        height,
        weight,
        partner_height,
        partner_weight,
        age,
        partner_age,
        occupation,
        race,
        father_name,
        mother_name,
        permanentDivision,
        presentDivision,
        email,
        phone,
      } = req.body;

      const updatedDocument = {
        name,
        photo,
        gender,
        birth_date,
        height,
        weight,
        partner_height,
        partner_weight,
        age,
        partner_age,
        occupation,
        race,
        father_name,
        mother_name,
        permanentDivision,
        presentDivision,
        email,
        phone,
      };
      const query = { _id: new ObjectId(id) };
      const options = {
        $set: updatedDocument,
      };
      const result = await biodataCollection.updateOne(query, options);
      res.send(result);
    });

    app.patch("/prem-biodata/premium/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const options = { upsert: true };
      const updateDoc = {
        $set: {
          status: "premium-request",
        },
      };

      const result = await biodataCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    app.patch("/biodata/appPremium/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const options = { upsert: true };
      const updateDoc = {
        $set: {
          status: "premium",
        },
      };
      const result = await biodataCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    // favorite api

    app.get("/favorite", async (req, res) => {
      const email = req.query.email;

      const query = { email: email };
      const result = await favoriteCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/favorites", async (req, res) => {
      const favBiodata = req.body;

      const query = {
        biodataId: favBiodata.biodataId,
        email: favBiodata.email,
      };

      const existingBiodata = await favoriteCollection.findOne(query);

      if (existingBiodata) {
        return res.send({
          message: "Biodata already added to the favorite list",
          insertedId: null,
        });
      }
      const result = await favoriteCollection.insertOne(favBiodata);
      res.send(result);
    });

    app.delete("/favorite/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await favoriteCollection.deleteOne(query);
      res.send(result);
    });

    // similar biodata api

    app.get("/similar", async (req, res) => {
      const result = await biodataCollection.find().toArray();
      res.send(result);
    });

    // contact request apis

    app.get("/contact-requests", async (req, res) => {
      const result = await contactRequestCollection.find().toArray();
      res.send(result);
    });

    app.get("/contact-request", async (req, res) => {
      const email = req.query.email;

      const query = { userEmail: email };
      const result = await contactRequestCollection.find(query).toArray();
      res.send(result);
    });

    app.patch("/contact-request", async (req, res) => {
      const filter = req.body;

      const query = { biodataId: filter.biodataId, email: filter.email };

      const existingBiodata = await contactRequestCollection.findOne(query);

      if (existingBiodata) {
        return res.send({
          message: "Biodata already added to the contact request list",
          insertedId: null,
        });
      }

      const options = { upsert: true };
      const updateDoc = {
        $set: {
          status: "pending",
        },
      };
      const result = await contactRequestCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    app.patch("/contact-requests/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          status: "approved",
        },
      };
      const result = await contactRequestCollection.updateOne(
        filter,
        updateDoc
      );
      res.send(result);
    });

    app.delete("/contacts-request/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await contactRequestCollection.deleteOne(query);
      res.send(result);
    });

    // payment / stripe api

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/payments", async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;

      const query = { biodataId: payment.biodataId, email: payment.email };

      const existingBiodata = await paymentCollection.findOne(query);

      if (existingBiodata) {
        return res.send({
          message: "Biodata already added to the contact request list",
          insertedId: null,
        });
      }

      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    });

    // marriage info apis

    app.get("/marriage", async (req, res) => {
      const filter = req.query;
      const query = {};
      const options = {
        sort: {
          marriage_date: filter.sort === "asc" ? 1 : -1,
        },
      };
      const result = await marriageCollection.find(query, options).toArray();
      res.send(result);
    });

    app.patch("/marriage", async (req, res) => {
      const marriage = req.body;
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          marriage_date: new Date(),
        },
      };
      const result = await marriageCollection.updateOne(
        marriage,
        updateDoc,
        options
      );

      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Heartsync server is running");
});

app.listen(port, () => {
  console.log(`Heartsync Server is running on port: ${port}`);
});
