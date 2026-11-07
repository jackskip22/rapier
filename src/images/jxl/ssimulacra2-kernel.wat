;; SPDX-License-Identifier: MIT
;; RGB photo reconstruction. The kernel build links this function into the shared kernel module.
(module
  (import "env" "memory" (memory 1))
  (global $s2_reconstruct_stack (mut i32) (i32.const 70032))
  (func $s2Reconstruct (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)
    (local i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 f32 f32 f32 f32 i32 i32 f32 i32 i32 i32 i32 i32 i32 i32 i32 i32 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128 v128)
    global.get $s2_reconstruct_stack
    i32.const 1024
    i32.sub
    local.tee 12
    global.set $s2_reconstruct_stack
    block  ;; label = @1
      local.get 3
      i32.const 1
      i32.lt_s
      br_if 0 (;@1;)
      local.get 2
      i32.const 1
      i32.lt_s
      br_if 0 (;@1;)
      local.get 4
      i32.const 2
      i32.add
      local.tee 13
      local.get 3
      local.get 2
      i32.mul
      local.tee 14
      i32.const 7
      i32.shl
      i32.add
      local.set 15
      local.get 13
      local.get 14
      i32.const 8
      i32.shl
      local.tee 16
      i32.add
      local.set 17
      local.get 0
      i32.const 2
      i32.shl
      local.set 18
      local.get 0
      i32.const 5
      i32.shl
      local.set 19
      local.get 2
      i32.const 7
      i32.shl
      local.set 20
      local.get 4
      local.get 16
      i32.add
      local.set 21
      i32.const 0
      local.set 22
      local.get 9
      i32.const 240
      i32.add
      local.set 23
      local.get 9
      i32.const 224
      i32.add
      local.set 24
      local.get 9
      i32.const 208
      i32.add
      local.set 25
      local.get 9
      i32.const 192
      i32.add
      local.set 26
      local.get 9
      i32.const 176
      i32.add
      local.set 27
      local.get 9
      i32.const 160
      i32.add
      local.set 28
      local.get 9
      i32.const 144
      i32.add
      local.set 29
      local.get 9
      i32.const 128
      i32.add
      local.set 30
      local.get 9
      i32.const 112
      i32.add
      local.set 31
      local.get 9
      i32.const 96
      i32.add
      local.set 32
      local.get 9
      i32.const 80
      i32.add
      local.set 33
      local.get 9
      i32.const 64
      i32.add
      local.set 34
      local.get 9
      i32.const 48
      i32.add
      local.set 35
      local.get 9
      i32.const 32
      i32.add
      local.set 36
      local.get 11
      local.set 37
      i32.const 0
      local.set 38
      loop  ;; label = @2
        local.get 38
        local.get 2
        i32.mul
        local.set 39
        local.get 38
        i32.const 3
        i32.shr_u
        local.get 8
        i32.mul
        local.set 40
        local.get 37
        local.set 41
        local.get 13
        local.set 42
        local.get 15
        local.set 43
        local.get 17
        local.set 44
        i32.const 0
        local.set 45
        loop  ;; label = @3
          local.get 4
          local.get 45
          local.get 39
          i32.add
          local.tee 16
          i32.const 7
          i32.shl
          local.tee 46
          i32.add
          i32.load16_s
          local.set 47
          local.get 6
          local.get 5
          local.get 16
          i32.add
          i32.load8_u
          i32.const 768
          i32.mul
          i32.add
          local.tee 48
          f32.load
          local.set 49
          local.get 12
          local.get 48
          f32.load offset=256
          local.get 4
          local.get 14
          local.get 16
          i32.add
          i32.const 7
          i32.shl
          i32.add
          i32.load16_s
          f32.convert_i32_s
          f32.mul
          local.tee 50
          f32.store offset=512
          local.get 12
          local.get 49
          local.get 47
          f32.convert_i32_s
          f32.mul
          local.get 50
          f32.add
          f32.store offset=256
          local.get 12
          local.get 21
          local.get 46
          i32.add
          i32.load16_s
          f32.convert_i32_s
          local.get 48
          f32.load offset=512
          f32.mul
          local.get 50
          f32.add
          f32.store offset=768
          local.get 7
          local.get 45
          i32.const 3
          i32.shr_u
          local.get 40
          i32.add
          i32.const 3
          i32.shl
          i32.add
          local.tee 16
          f32.load
          local.set 51
          local.get 16
          i32.const 4
          i32.add
          f32.load
          local.set 52
          i32.const 0
          local.set 16
          local.get 42
          local.set 46
          local.get 43
          local.set 47
          local.get 44
          local.set 53
          loop  ;; label = @4
            f32.const 0x0p+0 (;=0;)
            local.set 50
            f32.const 0x0p+0 (;=0;)
            local.set 49
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    local.get 46
                    i32.load16_u
                    local.tee 54
                    br_table 3 (;@5;) 1 (;@7;) 0 (;@8;)
                  end
                  local.get 54
                  i32.const 65535
                  i32.ne
                  br_if 1 (;@6;)
                end
                local.get 10
                f32.load
                local.get 54
                i32.const 16
                i32.shl
                i32.const 16
                i32.shr_s
                f32.convert_i32_s
                f32.mul
                local.set 49
                br 1 (;@5;)
              end
              local.get 54
              i32.const 16
              i32.shl
              i32.const 16
              i32.shr_s
              f32.convert_i32_s
              local.tee 49
              f32.const -0x1.28f5c2p-3 (;=-0.145;)
              local.get 49
              f32.div
              f32.add
              local.set 49
            end
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    local.get 47
                    i32.load16_u
                    local.tee 54
                    br_table 3 (;@5;) 1 (;@7;) 0 (;@8;)
                  end
                  local.get 54
                  i32.const 65535
                  i32.ne
                  br_if 1 (;@6;)
                end
                local.get 10
                f32.load offset=4
                local.get 54
                i32.const 16
                i32.shl
                i32.const 16
                i32.shr_s
                f32.convert_i32_s
                f32.mul
                local.set 50
                br 1 (;@5;)
              end
              local.get 54
              i32.const 16
              i32.shl
              i32.const 16
              i32.shr_s
              f32.convert_i32_s
              local.tee 50
              f32.const -0x1.28f5c2p-3 (;=-0.145;)
              local.get 50
              f32.div
              f32.add
              local.set 50
            end
            f32.const 0x0p+0 (;=0;)
            local.set 55
            block  ;; label = @5
              block  ;; label = @6
                block  ;; label = @7
                  block  ;; label = @8
                    local.get 53
                    i32.load16_u
                    local.tee 54
                    br_table 3 (;@5;) 1 (;@7;) 0 (;@8;)
                  end
                  local.get 54
                  i32.const 65535
                  i32.ne
                  br_if 1 (;@6;)
                end
                local.get 10
                f32.load offset=8
                local.get 54
                i32.const 16
                i32.shl
                i32.const 16
                i32.shr_s
                f32.convert_i32_s
                f32.mul
                local.set 55
                br 1 (;@5;)
              end
              local.get 54
              i32.const 16
              i32.shl
              i32.const 16
              i32.shr_s
              f32.convert_i32_s
              local.tee 55
              f32.const -0x1.28f5c2p-3 (;=-0.145;)
              local.get 55
              f32.div
              f32.add
              local.set 55
            end
            local.get 12
            i32.const 256
            i32.add
            local.get 16
            i32.add
            local.tee 54
            i32.const 260
            i32.add
            local.get 50
            local.get 48
            local.get 16
            i32.add
            local.tee 56
            i32.const 260
            i32.add
            f32.load
            f32.mul
            local.tee 50
            f32.store
            local.get 54
            i32.const 4
            i32.add
            local.get 49
            local.get 56
            i32.const 4
            i32.add
            f32.load
            f32.mul
            local.get 51
            local.get 50
            f32.mul
            f32.add
            f32.store
            local.get 54
            i32.const 516
            i32.add
            local.get 55
            local.get 56
            i32.const 516
            i32.add
            f32.load
            f32.mul
            local.get 52
            local.get 50
            f32.mul
            f32.add
            f32.store
            local.get 46
            i32.const 2
            i32.add
            local.set 46
            local.get 47
            i32.const 2
            i32.add
            local.set 47
            local.get 53
            i32.const 2
            i32.add
            local.set 53
            local.get 16
            i32.const 4
            i32.add
            local.tee 16
            i32.const 252
            i32.ne
            br_if 0 (;@4;)
          end
          i32.const 0
          local.set 57
          local.get 12
          i32.const 256
          i32.add
          local.set 54
          local.get 45
          i32.const 3
          i32.shl
          local.tee 56
          i32.const 1
          i32.or
          local.get 0
          i32.ge_s
          local.set 48
          local.get 56
          i32.const 2
          i32.or
          local.get 0
          i32.ge_s
          local.set 58
          local.get 56
          i32.const 3
          i32.or
          local.get 0
          i32.ge_s
          local.set 59
          local.get 56
          i32.const 4
          i32.or
          local.get 0
          i32.ge_s
          local.set 60
          local.get 56
          i32.const 5
          i32.or
          local.get 0
          i32.ge_s
          local.set 61
          local.get 56
          i32.const 6
          i32.or
          local.get 0
          i32.ge_s
          local.set 62
          local.get 56
          i32.const 7
          i32.or
          local.get 0
          i32.ge_s
          local.set 63
          local.get 41
          local.set 64
          loop  ;; label = @4
            local.get 23
            v128.load align=1
            local.set 65
            local.get 24
            v128.load align=1
            local.set 66
            local.get 25
            v128.load align=1
            local.set 67
            local.get 26
            v128.load align=1
            local.set 68
            local.get 27
            v128.load align=1
            local.set 69
            local.get 28
            v128.load align=1
            local.set 70
            local.get 29
            v128.load align=1
            local.set 71
            local.get 30
            v128.load align=1
            local.set 72
            local.get 31
            v128.load align=1
            local.set 73
            local.get 32
            v128.load align=1
            local.set 74
            local.get 33
            v128.load align=1
            local.set 75
            local.get 34
            v128.load align=1
            local.set 76
            local.get 35
            v128.load align=1
            local.set 77
            local.get 36
            v128.load align=1
            local.set 78
            local.get 9
            v128.load offset=16 align=1
            local.set 79
            local.get 9
            v128.load align=1
            local.set 80
            i32.const -256
            local.set 46
            loop  ;; label = @5
              local.get 12
              local.get 46
              i32.add
              local.tee 47
              i32.const 272
              i32.add
              local.get 79
              local.get 54
              local.get 46
              i32.add
              local.tee 16
              i32.const 256
              i32.add
              v128.load32_splat
              local.tee 81
              f32x4.mul
              v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000
              local.tee 82
              f32x4.add
              local.get 77
              local.get 16
              i32.const 260
              i32.add
              v128.load32_splat
              local.tee 83
              f32x4.mul
              f32x4.add
              local.get 75
              local.get 16
              i32.const 264
              i32.add
              v128.load32_splat
              local.tee 84
              f32x4.mul
              f32x4.add
              local.get 73
              local.get 16
              i32.const 268
              i32.add
              v128.load32_splat
              local.tee 85
              f32x4.mul
              f32x4.add
              local.get 71
              local.get 16
              i32.const 272
              i32.add
              v128.load32_splat
              local.tee 86
              f32x4.mul
              f32x4.add
              local.get 69
              local.get 16
              i32.const 276
              i32.add
              v128.load32_splat
              local.tee 87
              f32x4.mul
              f32x4.add
              local.get 67
              local.get 16
              i32.const 280
              i32.add
              v128.load32_splat
              local.tee 88
              f32x4.mul
              f32x4.add
              local.get 65
              local.get 16
              i32.const 284
              i32.add
              v128.load32_splat
              local.tee 89
              f32x4.mul
              f32x4.add
              v128.store
              local.get 47
              i32.const 256
              i32.add
              local.get 80
              local.get 81
              f32x4.mul
              local.get 82
              f32x4.add
              local.get 78
              local.get 83
              f32x4.mul
              f32x4.add
              local.get 76
              local.get 84
              f32x4.mul
              f32x4.add
              local.get 74
              local.get 85
              f32x4.mul
              f32x4.add
              local.get 72
              local.get 86
              f32x4.mul
              f32x4.add
              local.get 70
              local.get 87
              f32x4.mul
              f32x4.add
              local.get 68
              local.get 88
              f32x4.mul
              f32x4.add
              local.get 66
              local.get 89
              f32x4.mul
              f32x4.add
              v128.store
              local.get 46
              i32.const 32
              i32.add
              local.tee 46
              br_if 0 (;@5;)
            end
            i32.const -32
            local.set 53
            local.get 12
            v128.load offset=240
            local.set 90
            local.get 12
            v128.load offset=224
            local.set 78
            local.get 12
            v128.load offset=208
            local.set 91
            local.get 12
            v128.load offset=192
            local.set 89
            local.get 12
            v128.load offset=176
            local.set 92
            local.get 12
            v128.load offset=160
            local.set 88
            local.get 12
            v128.load offset=144
            local.set 79
            local.get 12
            v128.load offset=128
            local.set 87
            local.get 12
            v128.load offset=112
            local.set 80
            local.get 12
            v128.load offset=96
            local.set 86
            local.get 12
            v128.load offset=80
            local.set 65
            local.get 12
            v128.load offset=64
            local.set 85
            local.get 12
            v128.load offset=48
            local.set 66
            local.get 12
            v128.load offset=32
            local.set 84
            local.get 12
            v128.load offset=16
            local.set 67
            local.get 12
            v128.load
            local.set 83
            local.get 22
            local.set 46
            local.get 64
            local.set 47
            block  ;; label = @5
              loop  ;; label = @6
                local.get 46
                local.get 1
                i32.ge_s
                br_if 1 (;@5;)
                block  ;; label = @7
                  local.get 56
                  local.get 0
                  i32.ge_s
                  br_if 0 (;@7;)
                  local.get 47
                  v128.const i32x4 0x437f0000 0x437f0000 0x437f0000 0x437f0000
                  local.tee 77
                  local.get 82
                  local.get 83
                  local.get 9
                  local.get 53
                  i32.add
                  local.tee 16
                  i32.const 32
                  i32.add
                  v128.load32_splat
                  local.tee 76
                  f32x4.mul
                  local.get 82
                  f32x4.add
                  local.get 84
                  local.get 16
                  i32.const 64
                  i32.add
                  v128.load32_splat
                  local.tee 75
                  f32x4.mul
                  f32x4.add
                  local.get 85
                  local.get 16
                  i32.const 96
                  i32.add
                  v128.load32_splat
                  local.tee 74
                  f32x4.mul
                  f32x4.add
                  local.get 86
                  local.get 16
                  i32.const 128
                  i32.add
                  v128.load32_splat
                  local.tee 73
                  f32x4.mul
                  f32x4.add
                  local.get 87
                  local.get 16
                  i32.const 160
                  i32.add
                  v128.load32_splat
                  local.tee 72
                  f32x4.mul
                  f32x4.add
                  local.get 88
                  local.get 16
                  i32.const 192
                  i32.add
                  v128.load32_splat
                  local.tee 71
                  f32x4.mul
                  f32x4.add
                  local.get 89
                  local.get 16
                  i32.const 224
                  i32.add
                  v128.load32_splat
                  local.tee 70
                  f32x4.mul
                  f32x4.add
                  local.get 78
                  local.get 16
                  i32.const 256
                  i32.add
                  v128.load32_splat
                  local.tee 69
                  f32x4.mul
                  f32x4.add
                  f32x4.pmax
                  f32x4.pmin
                  v128.const i32x4 0x3f000000 0x3f000000 0x3f000000 0x3f000000
                  local.tee 68
                  f32x4.add
                  i32x4.trunc_sat_f32x4_s
                  local.tee 81
                  v128.store8_lane 0
                  local.get 48
                  br_if 0 (;@7;)
                  local.get 47
                  i32.const 4
                  i32.add
                  local.get 81
                  v128.store8_lane 4
                  local.get 58
                  br_if 0 (;@7;)
                  local.get 47
                  i32.const 8
                  i32.add
                  local.get 81
                  v128.store8_lane 8
                  local.get 59
                  br_if 0 (;@7;)
                  local.get 47
                  i32.const 12
                  i32.add
                  local.get 81
                  v128.store8_lane 12
                  local.get 60
                  br_if 0 (;@7;)
                  local.get 47
                  i32.const 16
                  i32.add
                  local.get 77
                  local.get 82
                  local.get 76
                  local.get 67
                  f32x4.mul
                  local.get 82
                  f32x4.add
                  local.get 75
                  local.get 66
                  f32x4.mul
                  f32x4.add
                  local.get 74
                  local.get 65
                  f32x4.mul
                  f32x4.add
                  local.get 73
                  local.get 80
                  f32x4.mul
                  f32x4.add
                  local.get 72
                  local.get 79
                  f32x4.mul
                  f32x4.add
                  local.get 71
                  local.get 92
                  f32x4.mul
                  f32x4.add
                  local.get 70
                  local.get 91
                  f32x4.mul
                  f32x4.add
                  local.get 69
                  local.get 90
                  f32x4.mul
                  f32x4.add
                  f32x4.pmax
                  f32x4.pmin
                  local.get 68
                  f32x4.add
                  i32x4.trunc_sat_f32x4_s
                  local.tee 81
                  v128.store8_lane 0
                  local.get 61
                  br_if 0 (;@7;)
                  local.get 47
                  i32.const 20
                  i32.add
                  local.get 81
                  v128.store8_lane 4
                  local.get 62
                  br_if 0 (;@7;)
                  local.get 47
                  i32.const 24
                  i32.add
                  local.get 81
                  v128.store8_lane 8
                  local.get 63
                  br_if 0 (;@7;)
                  local.get 47
                  i32.const 28
                  i32.add
                  local.get 81
                  v128.store8_lane 12
                end
                local.get 46
                i32.const 1
                i32.add
                local.set 46
                local.get 47
                local.get 18
                i32.add
                local.set 47
                local.get 53
                i32.const 4
                i32.add
                local.tee 53
                br_if 0 (;@6;)
              end
            end
            local.get 64
            i32.const 1
            i32.add
            local.set 64
            local.get 54
            i32.const 256
            i32.add
            local.set 54
            local.get 57
            i32.const 1
            i32.add
            local.tee 57
            i32.const 3
            i32.ne
            br_if 0 (;@4;)
          end
          local.get 41
          i32.const 32
          i32.add
          local.set 41
          local.get 42
          i32.const 128
          i32.add
          local.set 42
          local.get 43
          i32.const 128
          i32.add
          local.set 43
          local.get 44
          i32.const 128
          i32.add
          local.set 44
          local.get 45
          i32.const 1
          i32.add
          local.tee 45
          local.get 2
          i32.ne
          br_if 0 (;@3;)
        end
        local.get 22
        i32.const 8
        i32.add
        local.set 22
        local.get 37
        local.get 19
        i32.add
        local.set 37
        local.get 13
        local.get 20
        i32.add
        local.set 13
        local.get 15
        local.get 20
        i32.add
        local.set 15
        local.get 17
        local.get 20
        i32.add
        local.set 17
        local.get 38
        i32.const 1
        i32.add
        local.tee 38
        local.get 3
        i32.ne
        br_if 0 (;@2;)
      end
    end
    block  ;; label = @1
      local.get 0
      local.get 1
      i32.mul
      i32.const 2
      i32.shl
      local.tee 46
      i32.eqz
      br_if 0 (;@1;)
      i32.const 3
      local.set 16
      loop  ;; label = @2
        local.get 11
        local.get 16
        i32.add
        i32.const 255
        i32.store8
        local.get 16
        i32.const 4
        i32.add
        local.tee 16
        local.get 46
        i32.lt_u
        br_if 0 (;@2;)
      end
    end
    local.get 12
    i32.const 1024
    i32.add
    global.set $s2_reconstruct_stack)
  (func $s2Scratch (param $bytes i32) (result i32)
    (local $end i32) (local $have i32)
    local.get $bytes
    i32.const 0
    i32.lt_s
    if
      i32.const 0
      return
    end
    i32.const 70032
    local.get $bytes
    i32.add
    local.tee $end
    i32.const 70032
    i32.lt_u
    if
      i32.const 0
      return
    end
    memory.size
    i32.const 16
    i32.shl
    local.set $have
    local.get $end
    local.get $have
    i32.gt_u
    if
      local.get $end
      local.get $have
      i32.sub
      i32.const 65535
      i32.add
      i32.const 16
      i32.shr_u
      memory.grow
      i32.const -1
      i32.eq
      if
        i32.const 0
        return
      end
    end
    i32.const 70032)
  (export "s2Reconstruct" (func $s2Reconstruct))
  (export "s2Scratch" (func $s2Scratch)))
