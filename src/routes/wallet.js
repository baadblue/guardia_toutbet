import express from "express";
import { authenticateJWT } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  deposit,
  walletAmountSchema,
  withdraw,
} from "../controllers/walletController.js";

export const walletRouter = express.Router();

walletRouter.post("/deposit", authenticateJWT, validate(walletAmountSchema), deposit);
walletRouter.post("/withdraw", authenticateJWT, validate(walletAmountSchema), withdraw);
