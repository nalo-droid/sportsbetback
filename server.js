import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import betRoutes from './routes/betRoutes.js';
import matchRoutes from './routes/matchRoutes.js';
import userRoutes from './routes/userRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js'; 
import geminiRoutes from './routes/geminiRoutes.js';
import adminRoutes from './routes/adminRoutes.js';


dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const connection = mongoose.connection;
connection.once('open', () => {
  console.log('MongoDB database connection established successfully');
});

app.use('/api/bets', betRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/users', userRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/gemini', geminiRoutes); 
app.use('/api/admin', adminRoutes);



app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
