/**
 * User Management Component for AI Threat Modeler Dashboard
 * Only accessible to Admin users
 * 
 * Author: Sam Li
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import type { UserRole } from '@/contexts/AuthContext'

interface User {
  id: number
  username: string
  email: string
  role: UserRole
  password_changed: boolean
  created_at: string
  updated_at: string
}

export function UserManagement() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'Auditor' as UserRole,
  })

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await api.getUsers()
      setUsers(response.users || [])
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to load users')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      setError('')
      setSuccess('')
      await api.createUser(formData.username, formData.email, formData.password, formData.role)
      setSuccess('User created successfully')
      setShowCreateForm(false)
      setFormData({ username: '', email: '', password: '', role: 'Auditor' })
      loadUsers()
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to create user')
      }
    }
  }

  const handleUpdate = async () => {
    if (!editingUser) return

    try {
      setError('')
      setSuccess('')
      const updates: { username?: string; email?: string; role?: UserRole; password?: string } = {}
      if (formData.username !== editingUser.username) updates.username = formData.username
      if (formData.email !== editingUser.email) updates.email = formData.email
      if (formData.role !== editingUser.role) updates.role = formData.role
      if (formData.password) updates.password = formData.password

      await api.updateUser(editingUser.id, updates)
      setSuccess('User updated successfully')
      setEditingUser(null)
      setFormData({ username: '', email: '', password: '', role: 'Auditor' })
      loadUsers()
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to update user')
      }
    }
  }

  const handleDelete = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return
    }

    try {
      setError('')
      setSuccess('')
      await api.deleteUser(userId)
      setSuccess('User deleted successfully')
      loadUsers()
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to delete user')
      }
    }
  }

  const startEdit = (user: User) => {
    setEditingUser(user)
    setFormData({
      username: user.username,
      email: user.email,
      password: '',
      role: user.role,
    })
    setShowCreateForm(false)
  }

  const cancelEdit = () => {
    setEditingUser(null)
    setShowCreateForm(false)
    setFormData({ username: '', email: '', password: '', role: 'Auditor' })
  }

  const startCreate = () => {
    setEditingUser(null)
    setShowCreateForm(true)
    setFormData({ username: '', email: '', password: '', role: 'Auditor' })
  }

  // Check if current user is Admin
  if (currentUser?.role !== 'Admin') {
    return (
      <div className="container mx-auto max-w-4xl p-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>You need Admin privileges to access user management.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-6xl p-8">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Manage users and their roles. Only Admin users can access this page.
              </CardDescription>
            </div>
            <Button onClick={startCreate}>Create User</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md">
              {success}
            </div>
          )}

          {/* Create/Edit Form */}
          {(showCreateForm || editingUser) && (
            <Card>
              <CardHeader>
                <CardTitle>{editingUser ? 'Edit User' : 'Create New User'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Username</label>
                    <Input
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="Enter username"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="Enter email"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Password</label>
                    <Input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={editingUser ? "Leave blank to keep current password" : "Enter password"}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Role</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    >
                      <option value="Admin">Admin</option>
                      <option value="Operator">Operator</option>
                      <option value="Auditor">Auditor</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={editingUser ? handleUpdate : handleCreate}>
                    {editingUser ? 'Update User' : 'Create User'}
                  </Button>
                  <Button variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Users Table */}
          {loading ? (
            <div className="text-center py-8">Loading users...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">ID</th>
                    <th className="text-left p-3">Username</th>
                    <th className="text-left p-3">Email</th>
                    <th className="text-left p-3">Role</th>
                    <th className="text-left p-3">Password Changed</th>
                    <th className="text-left p-3">Created</th>
                    <th className="text-left p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-muted/50">
                      <td className="p-3">{user.id}</td>
                      <td className="p-3">{user.username}</td>
                      <td className="p-3">{user.email}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          user.role === 'Admin' ? 'bg-red-100 text-red-800' :
                          user.role === 'Operator' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="p-3">{user.password_changed ? 'Yes' : 'No'}</td>
                      <td className="p-3">{new Date(user.created_at).toLocaleDateString()}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEdit(user)}
                          >
                            Edit
                          </Button>
                          {user.id !== currentUser?.id && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(user.id)}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No users found
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

