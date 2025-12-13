const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config()
const port = process.env.PORT || 3000
const { MongoClient, ServerApiVersion } = require('mongodb');
//middleware
app.use(express.json())
app.use(cors())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yj7cq3y.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db('BloodLink')
    const usercollection = db.collection('users')
    const requestcollection = db.collection('requests')
    app.post('/users', async (req, res) => {
      const donor = req.body
      donor.role = "donor"
      donor.createdAt = new Date()
      const result = await usercollection.insertOne(donor)
      res.send(result)
    })

    app.get('/users/:email/role', async (req, res) => {
      const email = req.params.email
      const query = { email }
      const user = await usercollection.findOne(query)
      res.send({ role: user?.role || "user" })
      //user thakle role pathai diba noile 'user' pathaba
    })
    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email }
      const result = await usercollection.findOne(query)
      res.send(result)
    })
    app.patch('/users/:email', async (req, res) => {
      const email = req.params.email
      const query = { email }
      const fields = ["name", "divisions", "district", "bloodgroup"];
      const updateData = {};
      fields.forEach(f => {
        if (req.body[f] !== undefined && req.body[f] !== "") {
          updateData[f] = req.body[f];
        }
      });
      const result = await usercollection.updateOne(query, { $set: updateData })
      res.send(result)
    })
    app.post('/requests', async (req, res) => {
      const donor = req.body
      donor.status = "pending"
      donor.createdAt = new Date()
      const result = await requestcollection.insertOne(donor)
      res.send(result)
    })

    app.get('/requests/:email', async (req, res) => {
      const email = req.params.email;
      const { limit, skip, filter } = req.query
      const query = { email }
      if (filter && filter !== 'all') {
        query.status = filter;
      }
      const sorting = { sort: { createdAt: -1 } }
      const cursor = requestcollection.find(query, sorting)
        .limit(Number(limit)).skip(Number(skip));
      const result = await cursor.toArray()
      const totalCount = await requestcollection.countDocuments(query);
      // res.send(result)
      res.send({
        data: result,
        totalCount
      })
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
