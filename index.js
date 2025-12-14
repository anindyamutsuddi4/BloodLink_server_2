const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config()
const port = process.env.PORT || 3000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");

const serviceAccount = require("./bloodlink-1676e-firebase-adminsdk-fbsvc-89d5065ae7.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


//middleware
app.use(express.json())
app.use(cors())
const verifytoken = async (req, res, next) => {
  console.log(req.headers?.authorization)
  const token = req.headers.authorization
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  try {
    const idtoken = token.split(' ')[1]
    const decoded = await admin.auth().verifyIdToken(idtoken)
    console.log(decoded)
    req.decoded_email = decoded.email//decoded er moddhe email r value ekhane set kore dicchi
    //eta hocche jar token tar email nicchi

    next()
  } catch (err) {
    return res.status(401).send({ message: 'unauthorized access' })
  }

}

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

    const verifyadmin = async (req, res, next) => {
      const email = req.decoded_email//verifytoken middleware theke ei email ta pabo
      const query = { email }
      const user = await usercollection.findOne(query)
      if (!user || user.role != "admin") {
        return res.status(403).send({ message: "forbidden access" })
      }
      next()
    }
    app.post('/users', async (req, res) => {
      const donor = req.body
      donor.role = "donor"
      donor.createdAt = new Date()
      const result = await usercollection.insertOne(donor)
      res.send(result)
    })

    app.get('/users/:email/role', verifytoken, async (req, res) => {
      const email = req.params.email
      const query = { email }
      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "forbidden access" })
      }
      const user = await usercollection.findOne(query)
      res.send({ role: user?.role || "user" })
      //user thakle role pathai diba noile 'user' pathaba
    })
    app.get('/allusers', verifytoken,verifyadmin, async (req, res) => {
      const query = {}
      const { limit, skip, filter } = req.query
      if (filter && filter != "all") {
        query.status = filter
      }
      const cursor = usercollection.find(query).limit(Number(limit)).skip(Number(skip))
      const result = await cursor.toArray()
      const totalCount = await usercollection.countDocuments(query)
      res.send({
        data: result,
        totalCount
      })
    })
    app.get('/users/:email', verifytoken, async (req, res) => {
      const email = req.params.email;
      const query = { email }
      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "forbidden access" })
      }
      const result = await usercollection.findOne(query)
      res.send(result)
    })

    app.patch('/users/:email', verifytoken, async (req, res) => {
      const email = req.params.email
      const query = { email }
      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "forbidden access" })
      }
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
    app.patch('/userstatus/:id', verifytoken, async (req, res) => {
      const id = req.params.id
      const statusupdate = req.body
      const query = { _id: new ObjectId(id) }

      const update = {
        $set: {
          status: statusupdate.status
        }
      }
      const result = await usercollection.updateOne(query, update)
      res.send(result)
    })
    app.patch('/userrole/:id', verifytoken, async (req, res) => {
      const id = req.params.id
      const roleupdate = req.body
      const query = { _id: new ObjectId(id) }
      const update = {
        $set: {
          role: roleupdate.role
        }
      }
      const result = await usercollection.updateOne(query, update)
      res.send(result)
    })
    app.post('/requests', verifytoken, async (req, res) => {
      const donor = req.body
      donor.status = "pending"
      donor.createdAt = new Date()
      const result = await requestcollection.insertOne(donor)
      res.send(result)
    })
    app.get('/allrequests', verifytoken,verifyadmin, async (req, res) => {
      const query = {}
      const { limit, skip, filter } = req.query
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
    app.get('/requests/details/:id', verifytoken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await requestcollection.findOne(query)
      res.send(result)
    })
    app.patch('/requests/:id', verifytoken, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const fields = ["recipientname", "recipientdivision", "recipientdistrict", "hospital", "fulladdress", "bloodgroup", "donationDate", "donationTime", "requestMessage", "status"];
      const updateData = {};
      fields.forEach(f => {
        if (req.body[f] !== undefined && req.body[f] !== "") {
          updateData[f] = req.body[f];
        }
      });
      const result = await requestcollection.updateOne(query, { $set: updateData })
      res.send(result)
    })
    app.delete('/requests/:id', verifytoken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await requestcollection.deleteOne(query)
      res.send(result)
    })

    app.get('/requests/:email', verifytoken, async (req, res) => {
      const email = req.params.email;
      const { limit, skip, filter } = req.query
      const query = { email }
      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "forbidden access" })
      }
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
