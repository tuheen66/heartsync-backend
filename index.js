const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
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
    await client.connect();

    const biodataCollection = client.db("matrimony").collection("biodata");
    const userCollection = client.db("matrimony").collection("users");

    // jwt api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    const verifyToken = (req, res, next) => {
      console.log("inside verify token", req.headers.authorization);
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
          role: "premium",
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

    app.get("/biodata/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await biodataCollection.findOne(query);
      res.send(result);
    });

    app.get("/biodata/:email", async (req, res) => {
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
      console.log("biodata count", totalBiodata);

      let newBiodataId = totalBiodata + 1;
      const newInfo = {
        biodataId: newBiodataId,
        ...req.body,
      };

      const result = await biodataCollection.insertOne(newInfo);
      res.send(result);
    });

    app.put("/biodata/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateBiodata = req.body;
      const biodata = {
        $set: {
          name: updateBiodata.name,
          photo: updateBiodata.photo,
          gender: updateBiodata.gender,
          birth_date: updateBiodata.birth_date,
          height: updateBiodata.height,
          weight: updateBiodata.weight,
          partner_height: updateBiodata.partner_height,
          partner_weight: updateBiodata.partner_weight,
          age: updateBiodata.age,
          partner_age: updateBiodata.partner_age,
          occupation: updateBiodata.occupation,
          race: updateBiodata.race,
          father_name: updateBiodata.father_name,
          mother_name: updateBiodata.mother_name,
          permanentDivision: updateBiodata.permanentDivision,
          presentDivision: updateBiodata.presentDivision,
          phone: updateBiodata.phone,
        },
      };
      const result = await biodataCollection.updateOne(
        filter,
        biodata,
        options
      );
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Painting server is running");
});

app.listen(port, () => {
  console.log(`Painting Server is running on port: ${port}`);
});
