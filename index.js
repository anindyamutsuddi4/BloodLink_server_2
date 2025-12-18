const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config()
const port = process.env.PORT || 3000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
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
    const paymenthistory = db.collection('payments')

    const verifyadmin = async (req, res, next) => {
      const email = req.decoded_email//verifytoken middleware theke ei email ta pabo
      const query = { email }
      const user = await usercollection.findOne(query)
      if (!user || user.role != "admin") {
        return res.status(403).send({ message: "forbidden access" })
      }
      next()
    }
    app.post('/create-checkout-session', verifytoken, async (req, res) => {
      const paymentinfo = req.body
      const amount = parseInt(paymentinfo.cost) * 100
      if (!amount || isNaN(amount)) {
        return res.status(400).send({ message: "Invalid cost" })
      }
      if (!paymentinfo.senderEmail) {
        return res.status(400).send({ message: "Email required" })
      }

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, price_1234) of the product you want to sell
            price_data: {
              currency: 'usd',
              unit_amount: amount,
              product_data: {
                name: "funding contribution",
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentinfo.senderEmail,//extra
        mode: 'payment',
        // metadata: {
        //     parcelId: paymentinfo.id,
        //     parcelName: paymentinfo.parcelName
        // },
        success_url:
          //nijera ekta sessionid generate kore dicche ,jeta pore oi email r jonno,
          //paymentstatus valid kina check korte help korbe
          `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        //env theke ekhane set kore dite hobe
        cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`
      });
      //console.log(session)
      res.send({ url: session.url })
    });
    app.post('/payment-success', verifytoken, async (req, res) => {
      const id = req.query.session_id
      const session = await stripe.checkout.sessions.retrieve(id)
      //checking if a payment is added twice
      const transactionId = session.payment_intent
      const query = { transactionId: transactionId }
      const paymentexist = await paymenthistory.findOne(query)
      if (paymentexist) {
        return res.send({
          message: 'already exists',
          //trackingid,transaction id send korte hobe,noile ui te dekhabe na,
          //frontend e ei duita jinnish expect korche,so amadrke pathate hobe
          trackingId: paymentexist.trackingId,
          transactionId: transactionId

        }
        )
      }

      if (session.payment_status == "paid") {
        const session = await stripe.checkout.sessions.retrieve(req.query.session_id, {
          expand: ['line_items']
        });
        const totalAmount = session.amount_total;
        //console.log(totalAmount / 100);
        const bill = {}
        bill.transactionId = transactionId
        bill.cost = totalAmount / 100
        bill.session = id
        bill.email = session.customer_email
        bill.date = new Date()
        const result = await paymenthistory.insertOne(bill)
        res.send({
          success: true,//client k reponse pathacchi
          paymentinfo: result,
          transactionId: session.payment_intent
        })


        // const paymentdata = {
        //   amount: session.amount_total / 100,
        //   currency: session.currency,
        //   customeremail: session.customer_email,
        //   transactionId: session.payment_intent,
        //   paidAt: new Date(),
        //   trackingId: trackingId
        // }

        // const paymentres = await paymenthistory.insertOne(paymentdata)

        //res.send(result)
      }
    })
    app.post('/users', async (req, res) => {
      const donor = req.body
      donor.role = "donor"
      donor.status = "active"
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
    app.get('/allusers', verifytoken, verifyadmin, async (req, res) => {
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
    app.get('/allusersforvolunteer', verifytoken, async (req, res) => {
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
    app.get('/searchusers', async (req, res) => {
      // const id = req.params.id
      const query = {}
      const { limit, skip, filterbydivision, filterbydistrict, filterbygroup } = req.query
      if (filterbydivision == "Pick a division" && filterbydistrict == "Pick a district" && filterbygroup == "Select your blood group") {
        return res.send({ message: 'find specific something' })
      }
      if (filterbydivision && filterbydivision !== "Pick a division" && filterbydivision !== "") {
        query.divisions = filterbydivision
      }
      if (filterbydistrict && filterbydistrict !== "Pick a district" && filterbydistrict !== "") {
        query.district = filterbydistrict
      }
      if (filterbygroup && filterbygroup !== "Select your blood group" && filterbygroup !== "") {
        query.bloodgroup = filterbygroup
      }
      const cursor = usercollection.find(query).limit(Number(limit)).skip(Number(skip))
      const result = await cursor.toArray()
      const totalCount = await usercollection.countDocuments(query)
      res.send({
        data: result,
        totalCount
      })
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
    app.get('/allrequests', verifytoken, verifyadmin, async (req, res) => {
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
    app.get('/public/allrequests', async (req, res) => {
      const query = {}
      const { limit, skip, filter } = req.query
      if (filter) {
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
    app.get('/allrequestsforvolunteer', verifytoken, async (req, res) => {
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
