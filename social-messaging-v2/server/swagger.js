const swaggerUi = require('swagger-ui-express');

const swaggerDocument = {
    openapi: '3.0.0',
    info: {
        title: 'Social Messaging API',
        version: '1.0.0',
        description: 'API Documentation for Social Messaging Web App',
        contact: {
            name: 'Bang Ucok & Antigravity',
            email: 'emailsinaga@gmail.com',
            url: 'https://wa.me/6281234500747'
        }
    },
    servers: [
        {
            url: 'http://localhost:3001',
            description: 'Local Development Server'
        }
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT'
            }
        },
        schemas: {
            User: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    username: { type: 'string' },
                    full_name: { type: 'string' },
                    country: { type: 'string' },
                    profile_pic: { type: 'string' },
                    bio: { type: 'string' }
                }
            },
            Message: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    sender_id: { type: 'integer' },
                    receiver_id: { type: 'integer' },
                    content: { type: 'string' },
                    type: { type: 'string', enum: ['text', 'image', 'voice', 'file'] },
                    file_url: { type: 'string' },
                    created_at: { type: 'string', format: 'date-time' }
                }
            }
        }
    },
    paths: {
        '/api/register': {
            post: {
                tags: ['Auth'],
                summary: 'Register a new user',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    username: { type: 'string' },
                                    password: { type: 'string' },
                                    full_name: { type: 'string' },
                                    country: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    201: { description: 'User created' },
                    400: { description: 'Username exists' }
                }
            }
        },
        '/api/login': {
            post: {
                tags: ['Auth'],
                summary: 'Login user',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    username: { type: 'string' },
                                    password: { type: 'string' }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Login success',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        token: { type: 'string' },
                                        user: { $ref: '#/components/schemas/User' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        '/api/users/search': {
            get: {
                tags: ['Users'],
                security: [{ bearerAuth: [] }],
                summary: 'Search users',
                parameters: [
                    {
                        in: 'query',
                        name: 'q',
                        schema: { type: 'string' },
                        description: 'Search query'
                    }
                ],
                responses: {
                    200: {
                        description: 'List of users',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/User' }
                                }
                            }
                        }
                    }
                }
            }
        },
        '/api/users/recent': {
            get: {
                tags: ['Users'],
                security: [{ bearerAuth: [] }],
                summary: 'Get recent chats',
                responses: {
                    200: {
                        description: 'List of recent users',
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: { $ref: '#/components/schemas/User' } }
                            }
                        }
                    }
                }
            }
        },
        '/api/messages/{friendId}': {
            get: {
                tags: ['Messages'],
                security: [{ bearerAuth: [] }],
                summary: 'Get message history with friend',
                parameters: [
                    {
                        in: 'path',
                        name: 'friendId',
                        required: true,
                        schema: { type: 'integer' }
                    }
                ],
                responses: {
                    200: {
                        description: 'Message history',
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: { $ref: '#/components/schemas/Message' } }
                            }
                        }
                    }
                }
            }
        },
        '/api/friends/list': {
            get: {
                tags: ['Friends'],
                security: [{ bearerAuth: [] }],
                summary: 'Get friends list',
                responses: {
                    200: {
                        description: 'List of friends',
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: { $ref: '#/components/schemas/User' } }
                            }
                        }
                    }
                }
            }
        },
        '/api/friends/request': {
            post: {
                tags: ['Friends'],
                security: [{ bearerAuth: [] }],
                summary: 'Send friend request',
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { friendId: { type: 'integer' } }
                            }
                        }
                    }
                },
                responses: {
                    200: { description: 'Request sent' }
                }
            }
        }
        // Note: Add other endpoints similarly as needed
    }
};

module.exports = (app) => {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
};
