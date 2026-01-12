import express from "express";
import path from "path"
import { fileURLToPath } from "url";

import { ApolloServer } from "apollo-server-express";
import { GraphQLUpload, graphqlUploadExpress } from "graphql-upload";
import cors from "cors";
//must use lodash for project
import _ from "lodash";
//*For Subscriptions
import { createServer } from "http";
import { ApolloServerPluginDrainHttpServer } from "apollo-server-core";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { useServer } from "graphql-ws/lib/use/ws";
import { WebSocketServer } from "ws";
import { PubSub } from "graphql-subscriptions";
const pubsub = new PubSub();
// *import files

import {connectToDB} from "./utils/db.js";
import {PORT} from "./utils/config.js";


import  {verifyToken}  from "./auth/jwt/jwt.js";

// * importing resolvers and typeDefs
import resolvers from "./graphql/resolvers/index.js";


import warehouseTypeDefs from "./graphql/typeDefs/warehouse.typeDefs.js";
import productTypeDefs from "./graphql/typeDefs/product.typeDefs.js";
import purchaseTypeDefs from "./graphql/typeDefs/purchase.typeDefs.js";
import sellerTypeDefs from "./graphql/typeDefs/seller.typeDefs.js";
import saleTypeDefs from "./graphql/typeDefs/sale.typeDefs.js";
import userTypeDefs from "./graphql/typeDefs/user.typeDefs.js";
import projectTypeDefs from "./graphql/typeDefs/project.typeDefs.js";






const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// * DB Connection
connectToDB();
// Create the schema, which will be used separately by ApolloServer and
// the WebSocket server.
const schema = makeExecutableSchema({
  typeDefs: [warehouseTypeDefs,productTypeDefs,purchaseTypeDefs,sellerTypeDefs,saleTypeDefs,userTypeDefs,projectTypeDefs],
  resolvers,
});
// ...
// Create an Express app and HTTP server; we will attach both the WebSocket
// server and the ApolloServer to this HTTP server.
const app = express();
app.use(cors());
app.use(
  graphqlUploadExpress({
    maxFileSize: 50000000, //50 MB
    maxFiles: 20,
  })
);

app.use("/src/public", express.static("public"));
app.use(
  express.json({
    extended: true,
  })
);

const httpServer = createServer(app);
// Create our WebSocket server using the HTTP server we just set up.
const wsServer = new WebSocketServer({
  server: httpServer,
  path: "/graphql",
});
// Save the returned server's info so we can shutdown this server later
const serverCleanup = useServer(
  {
    schema,
    // context: {
    //   // pubsub,
    // },
  },
  wsServer
);

// Set up ApolloServer.
const server = new ApolloServer({
  schema,
  playground: true,
  plugins: [
    // Proper shutdown for the HTTP server.
    ApolloServerPluginDrainHttpServer({ httpServer }),
    // Proper shutdown for the WebSocket server.
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
  ],
  context: {
    pubsub,
  },

  context: async ({ req }) => {
    let currentUser;
    let token;
    // console.log(req.headers.authorization,"Token")
    if (req.headers.authorization) {
      token = req.headers.authorization;
      currentUser = await verifyToken(token);
      // console.log(currentUser,"currentUser")
      return {
        user: currentUser,
      
      };
    }
    
  },
});
const main = async () => {
  await server.start();
  server.applyMiddleware({ app });
  // Now that our HTTP server is fully set up, we can listen to it.
  httpServer.listen(PORT, () => {
    console.log(
      `Server is now running on http://localhost:${PORT}${server.graphqlPath}`
    );
  });
};

main();
